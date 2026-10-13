// Drains the `jobs` outbox: pushes planner changes to GitHub and posts the Slack activity feed.
// Called by a trigger when jobs are inserted and every minute by pg_cron (for retries).
import { admin, appUrl, json, requireInternal, serve } from '../_shared/http.ts';
import { installationOctokit, splitRepo } from '../_shared/github.ts';
import { buildGithubBody } from '../_shared/refs.ts';
import { button, context, esc, postMessage, section } from '../_shared/slack.ts';

interface Job {
  id: number;
  kind: string;
  entity_id: string | null;
  // deno-lint-ignore no-explicit-any
  payload: any;
  attempts: number;
}

const MAX_ATTEMPTS = 5;

serve(async (req) => {
  requireInternal(req);
  const { data: jobs, error } = await admin.rpc('claim_jobs', { p_limit: 25 });
  if (error) throw error;

  const results = [];
  for (const job of (jobs ?? []) as Job[]) {
    try {
      await handle(job);
      await admin.from('jobs').update({ status: 'done', last_error: null }).eq('id', job.id);
      results.push({ id: job.id, ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`job ${job.id} (${job.kind}) failed:`, message);
      const failed = job.attempts >= MAX_ATTEMPTS;
      await admin
        .from('jobs')
        .update({
          status: failed ? 'failed' : 'pending',
          last_error: message,
          run_after: new Date(Date.now() + 2 ** job.attempts * 60_000).toISOString(),
        })
        .eq('id', job.id);
      results.push({ id: job.id, ok: false, error: message });
    }
  }
  return json({ processed: results.length, results });
});

async function handle(job: Job) {
  switch (job.kind) {
    case 'github.upsert_issue':
      return pushIssue(job.entity_id!);
    case 'github.create_comment':
      return pushComment(job.entity_id!);
    case 'slack.feed':
      return slackFeed(job.payload);
    default:
      throw new Error(`unknown job kind ${job.kind}`);
  }
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

async function pushIssue(issueId: string) {
  const { data: issue, error } = await admin
    .from('issues')
    .select(`
      id, identifier, title, description, github_issue_number,
      repo:repos(full_name, installation_id),
      assignee:people(github_login),
      state:workflow_states(category),
      labels:issue_labels(label:labels(name))
    `)
    .eq('id', issueId)
    .single();
  if (error) throw error;
  if (!issue.repo) return; // repo was unlinked since the job was queued

  // deno-lint-ignore no-explicit-any
  const i = issue as any;
  const octokit = await installationOctokit(i.repo.installation_id);
  const { owner, repo } = splitRepo(i.repo.full_name);
  const closed = ['completed', 'canceled'].includes(i.state.category);
  const stateReason: 'completed' | 'not_planned' = i.state.category === 'canceled' ? 'not_planned' : 'completed';
  const params = {
    owner,
    repo,
    title: i.title,
    body: buildGithubBody(i.description, i.identifier, appUrl(`/issue/${i.identifier}`)),
    labels: i.labels.map((l: { label: { name: string } }) => l.label.name),
    assignees: i.assignee?.github_login ? [i.assignee.github_login] : [],
    state: (closed ? 'closed' : 'open') as 'open' | 'closed',
  };

  // Assigning someone without repo access fails with 422; retry without the assignee.
  const send = async (p: typeof params) => {
    if (i.github_issue_number) {
      return octokit.request('PATCH /repos/{owner}/{repo}/issues/{issue_number}', {
        ...p,
        issue_number: i.github_issue_number,
        state_reason: p.state === 'closed' ? stateReason : undefined,
      });
    }
    // GitHub can't create an issue already closed, so close it right after.
    const { state, ...create } = p;
    const res = await octokit.request('POST /repos/{owner}/{repo}/issues', create);
    if (state === 'closed') {
      await octokit.request('PATCH /repos/{owner}/{repo}/issues/{issue_number}', {
        owner, repo, issue_number: res.data.number, state: 'closed', state_reason: stateReason,
      });
    }
    return res;
  };

  let res;
  try {
    res = await send(params);
  } catch (e) {
    if ((e as { status?: number }).status !== 422 || params.assignees.length === 0) throw e;
    res = await send({ ...params, assignees: [] });
  }

  await admin
    .from('issues')
    .update({
      github_issue_number: res.data.number,
      github_issue_id: res.data.id,
      github_url: res.data.html_url,
      last_synced_at: new Date().toISOString(),
    })
    .eq('id', issueId);
}

async function pushComment(commentId: string) {
  const { data, error } = await admin
    .from('comments')
    .select(`
      id, body, github_comment_id,
      author:profiles(name, github_login),
      issue:issues(github_issue_number, repo:repos(full_name, installation_id))
    `)
    .eq('id', commentId)
    .single();
  if (error) throw error;
  // deno-lint-ignore no-explicit-any
  const c = data as any;
  if (c.github_comment_id || !c.issue?.github_issue_number || !c.issue.repo) return;

  const octokit = await installationOctokit(c.issue.repo.installation_id);
  const { owner, repo } = splitRepo(c.issue.repo.full_name);
  const who = c.author?.github_login ? `@${c.author.github_login}` : c.author?.name ?? 'A team lead';
  const res = await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
    owner,
    repo,
    issue_number: c.issue.github_issue_number,
    body: `${c.body}\n\n<sub>— ${who} via Quadratic</sub>`,
  });
  await admin.from('comments').update({ github_comment_id: res.data.id }).eq('id', commentId);
}

// ---------------------------------------------------------------------------
// Slack activity feed
// ---------------------------------------------------------------------------

const FEED_TOGGLE: Record<string, string> = {
  issue_created: 'feed_issue_created',
  status_changed: 'feed_status_changed',
  pr_opened: 'feed_pr_opened',
  pr_merged: 'feed_pr_merged',
};

// deno-lint-ignore no-explicit-any
async function slackFeed(p: any) {
  let teamId: string = p.team_id;
  // deno-lint-ignore no-explicit-any
  let issue: any = null;
  if (p.issue_id) {
    const { data } = await admin
      .from('issues')
      .select('id, team_id, identifier, title, github_url, assignee:people(name, slack_user_id), creator:profiles(name)')
      .eq('id', p.issue_id)
      .maybeSingle();
    if (!data) return; // deleted
    issue = data;
    teamId = data.team_id;
  }

  const { data: team } = await admin
    .from('teams')
    .select('slack_channel_id, archived, settings:notification_settings(*)')
    .eq('id', teamId)
    .single();
  // deno-lint-ignore no-explicit-any
  const settings = (team as any)?.settings;
  if (!team?.slack_channel_id || team.archived || !settings?.[FEED_TOGGLE[p.event]]) return;

  const link = (i: { identifier: string; title: string }) =>
    `<${appUrl(`/issue/${i.identifier}`)}|*${i.identifier}* ${esc(i.title)}>`;
  const mention = (a?: { name: string; slack_user_id: string | null } | null) =>
    a ? (a.slack_user_id ? `<@${a.slack_user_id}>` : esc(a.name)) : 'unassigned';

  let text: string;
  switch (p.event) {
    case 'issue_created':
      text = `🆕 ${link(issue)}\nAssignee: ${mention(issue.assignee)}${issue.creator ? ` · created by ${esc(issue.creator.name)}` : ' · opened on GitHub'}`;
      break;
    case 'status_changed':
      text = `🔁 ${link(issue)} moved *${esc(p.from)}* → *${esc(p.to)}*`;
      break;
    case 'pr_opened':
    case 'pr_merged': {
      const { data: pr } = await admin
        .from('pull_requests')
        .select('number, title, url, author_login, issues:issue_pull_requests(issue:issues(identifier, title))')
        .eq('id', p.pull_request_id)
        .single();
      if (!pr) return;
      // deno-lint-ignore no-explicit-any
      const linked = (pr as any).issues.map((x: any) => link(x.issue)).join(', ');
      const verb = p.event === 'pr_merged' ? '🎉 Merged' : '🔧 PR opened';
      text = `${verb}: <${pr.url}|#${pr.number} ${esc(pr.title)}> by ${esc(pr.author_login ?? 'someone')}` +
        (linked ? `\nLinked: ${linked}` : '');
      break;
    }
    default:
      return;
  }

  const blocks = [section(text)];
  if (issue?.github_url) blocks.push(context(`<${issue.github_url}|View on GitHub>`));
  if (issue && p.event === 'issue_created') blocks.push(button('Open in Quadratic', appUrl(`/issue/${issue.identifier}`)));
  await postMessage(team.slack_channel_id, text.replace(/<[^|>]+\|([^>]+)>/g, '$1'), blocks);
}
