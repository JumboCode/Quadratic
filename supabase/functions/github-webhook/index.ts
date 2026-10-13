// Receives GitHub App webhooks and mirrors issue / comment / PR activity into the planner.
import { admin, HttpError, json, serve } from '../_shared/http.ts';
import { botLogin, verifyWebhookSignature } from '../_shared/github.ts';
import { parseIdentifiers, parseIssueNumbers, stripGithubFooter } from '../_shared/refs.ts';

// deno-lint-ignore no-explicit-any
type Payload = any;

interface Repo {
  id: string;
  team_id: string;
  full_name: string;
  default_branch: string;
}

serve(async (req) => {
  const raw = await req.text();
  if (!(await verifyWebhookSignature(raw, req.headers.get('x-hub-signature-256')))) {
    throw new HttpError(401, 'bad signature');
  }
  const event = req.headers.get('x-github-event') ?? '';
  const payload: Payload = JSON.parse(raw);

  if (event === 'ping') return json({ ok: true, pong: true });
  if (payload.sender?.login === botLogin()) return json({ ok: true, ignored: 'own change' });
  if (!payload.repository) return json({ ok: true, ignored: 'no repository' });

  const { data: repo } = await admin
    .from('repos')
    .select('id, team_id, full_name, default_branch')
    .eq('github_repo_id', payload.repository.id)
    .maybeSingle<Repo>();
  if (!repo) return json({ ok: true, ignored: 'repo not linked to a team' });

  // Keep repo metadata fresh (renames, default branch changes).
  if (repo.full_name !== payload.repository.full_name || repo.default_branch !== payload.repository.default_branch) {
    await admin
      .from('repos')
      .update({ full_name: payload.repository.full_name, default_branch: payload.repository.default_branch })
      .eq('id', repo.id);
    repo.default_branch = payload.repository.default_branch;
  }

  switch (event) {
    case 'issues':
      await onIssue(repo, payload);
      break;
    case 'issue_comment':
      await onIssueComment(repo, payload);
      break;
    case 'pull_request':
      await onPullRequest(repo, payload);
      break;
    case 'pull_request_review':
      await onPullRequestReview(repo, payload);
      break;
    case 'push':
      await onPush(repo, payload);
      break;
  }
  return json({ ok: true });
});

async function onIssue(repo: Repo, p: Payload) {
  if (p.action === 'deleted' || p.action === 'transferred') {
    // Keep the planner issue, but unlink it from the vanished GitHub issue.
    await admin
      .from('issues')
      .update({ github_issue_number: null, github_issue_id: null, github_url: null, repo_id: null })
      .eq('repo_id', repo.id)
      .eq('github_issue_number', p.issue.number);
    return;
  }
  const issue = p.issue;
  const { error } = await admin.rpc('github_upsert_issue', {
    p_team: repo.team_id,
    p_repo: repo.id,
    p_number: issue.number,
    p_github_id: issue.id,
    p_url: issue.html_url,
    p_title: issue.title,
    p_body: stripGithubFooter(issue.body),
    p_open: issue.state === 'open',
    p_state_reason: issue.state_reason,
    p_assignee_login: issue.assignee?.login ?? null,
    p_label_names: (issue.labels ?? []).map((l: { name: string }) => l.name),
    p_create_if_missing: true,
  });
  if (error) throw error;
}

async function findIssueId(repo: Repo, number: number): Promise<string | null> {
  const { data } = await admin
    .from('issues')
    .select('id')
    .eq('repo_id', repo.id)
    .eq('github_issue_number', number)
    .maybeSingle();
  return data?.id ?? null;
}

async function onIssueComment(repo: Repo, p: Payload) {
  if (p.issue.pull_request) return; // comments on PRs aren't planner comments
  if (p.action === 'deleted') {
    await admin.from('comments').delete().eq('github_comment_id', p.comment.id);
    return;
  }
  const issueId = await findIssueId(repo, p.issue.number);
  if (!issueId) return;
  const { error } = await admin.from('comments').upsert(
    {
      issue_id: issueId,
      github_comment_id: p.comment.id,
      github_author_login: p.comment.user.login,
      body: p.comment.body ?? '',
      created_at: p.comment.created_at,
    },
    { onConflict: 'github_comment_id' },
  );
  if (error) throw error;
}

async function linkedIssues(repo: Repo, texts: (string | null | undefined)[]) {
  const numbers = texts.flatMap((t) => parseIssueNumbers(t, repo.full_name));
  const { data: teams } = await admin.from('teams').select('key');
  const identifiers = texts.flatMap((t) => parseIdentifiers(t, (teams ?? []).map((x) => x.key)));

  const found = new Map<string, { id: string; team_id: string }>();
  if (numbers.length) {
    const { data } = await admin
      .from('issues')
      .select('id, team_id')
      .eq('repo_id', repo.id)
      .in('github_issue_number', numbers);
    data?.forEach((i) => found.set(i.id, i));
  }
  if (identifiers.length) {
    const { data } = await admin.from('issues').select('id, team_id').in('identifier', identifiers);
    data?.forEach((i) => found.set(i.id, i));
  }
  return [...found.values()];
}

async function onPullRequest(repo: Repo, p: Payload) {
  const pr = p.pull_request;
  const state = pr.merged ? 'merged' : pr.state === 'closed' ? 'closed' : pr.draft ? 'draft' : 'open';
  const row: Record<string, unknown> = {
    repo_id: repo.id,
    number: pr.number,
    title: pr.title,
    url: pr.html_url,
    state,
    author_login: pr.user?.login,
    head_branch: pr.head?.ref,
    base_branch: pr.base?.ref,
    merged_at: pr.merged_at,
    updated_at: new Date().toISOString(),
  };
  if (p.action === 'review_requested') row.review_state = 'pending';

  const { data: saved, error } = await admin
    .from('pull_requests')
    .upsert(row, { onConflict: 'repo_id,number' })
    .select('id')
    .single();
  if (error) throw error;

  const issues = await linkedIssues(repo, [pr.title, pr.body, pr.head?.ref]);
  if (issues.length) {
    await admin
      .from('issue_pull_requests')
      .upsert(issues.map((i) => ({ issue_id: i.id, pull_request_id: saved.id })), { ignoreDuplicates: true });
  }

  // Status automation, using each issue's team settings.
  const teamIds = [...new Set(issues.map((i) => i.team_id))];
  const { data: teams } = await admin
    .from('teams')
    .select('id, pr_opened_state_id, pr_review_state_id, pr_merged_state_id')
    .in('id', teamIds.length ? teamIds : ['00000000-0000-0000-0000-000000000000']);
  const teamById = new Map((teams ?? []).map((t) => [t.id, t]));

  // Not 'synchronize'/'edited': a push to a PR shouldn't undo a lead manually moving the issue back.
  const isOpenEvent = ['opened', 'reopened', 'ready_for_review'].includes(p.action);
  const mergedToDefault = p.action === 'closed' && pr.merged && pr.base?.ref === repo.default_branch;

  for (const issue of issues) {
    const team = teamById.get(issue.team_id);
    if (!team) continue;
    let target: string | null = null;
    if (mergedToDefault) target = team.pr_merged_state_id;
    else if (p.action === 'review_requested') target = team.pr_review_state_id;
    else if (isOpenEvent && state !== 'closed') target = team.pr_opened_state_id;
    if (target) await admin.rpc('github_advance_issue', { p_issue: issue.id, p_target_state: target });

    if (!['opened', 'reopened', 'ready_for_review', 'review_requested', 'closed'].includes(p.action)) continue;
    await admin.from('activity').insert({
      team_id: issue.team_id,
      issue_id: issue.id,
      actor_github_login: p.sender?.login,
      verb: 'pull_request',
      data: { action: mergedToDefault ? 'merged' : p.action, number: pr.number, title: pr.title, url: pr.html_url },
    });
  }

  const feedEvent = mergedToDefault ? 'pr_merged' : p.action === 'opened' && !pr.draft ? 'pr_opened' : null;
  if (feedEvent) {
    await admin.from('jobs').insert({
      kind: 'slack.feed',
      payload: { event: feedEvent, team_id: repo.team_id, pull_request_id: saved.id },
    });
  }
}

async function onPullRequestReview(repo: Repo, p: Payload) {
  if (p.action !== 'submitted') return;
  const review = p.review.state === 'approved'
    ? 'approved'
    : p.review.state === 'changes_requested'
    ? 'changes_requested'
    : null;
  if (!review) return;
  await admin
    .from('pull_requests')
    .update({ review_state: review, updated_at: new Date().toISOString() })
    .eq('repo_id', repo.id)
    .eq('number', p.pull_request.number);
}

async function onPush(repo: Repo, p: Payload) {
  for (const commit of p.commits ?? []) {
    const issues = await linkedIssues(repo, [commit.message]);
    for (const issue of issues) {
      await admin.from('activity').insert({
        team_id: issue.team_id,
        issue_id: issue.id,
        actor_github_login: commit.author?.username ?? commit.author?.name,
        verb: 'commit',
        data: { message: commit.message.split('\n')[0], url: commit.url, sha: commit.id.slice(0, 7) },
      });
    }
  }
}
