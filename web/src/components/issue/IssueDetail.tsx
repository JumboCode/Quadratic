import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Check, Copy, ExternalLink, GitBranch, GitMerge, GitPullRequest, Github, Link2, Lock, Maximize2, Plus, Trash2, X,
} from 'lucide-react';
import { branchName } from '../../../../supabase/functions/_shared/refs';
import { useAuth } from '../../lib/auth';
import {
  useActivity, useComments, useIssue, useIssuePullRequests, useIssues, useMilestones, useProfiles, useSetIssueLabels,
  useTeams, useUpdateIssue,
} from '../../lib/queries';
import { supabase, unwrap } from '../../lib/supabase';
import { useTeamBundle } from '../../lib/team-bundle';
import type { Activity, Comment, Issue } from '../../lib/types';
import { useUI } from '../../lib/ui-context';
import { ago, cn, PRIORITIES } from '../../lib/utils';
import { Markdown, MarkdownEditor } from '../Markdown';
import { Avatar, Badge, Button, Empty, PageLoader, Picker, Switch, Textarea } from '../ui';
import {
  AssigneePicker, Chip, CyclePicker, DueDateInput, EstimateInput, LabelPicker, PriorityPicker, ProjectPicker, StatePicker,
} from './pickers';
import { IssueRow } from './IssueViews';

/** Slide-over panel used from boards and lists (driven by ?issue=ID). */
export function IssuePanel({ identifier, onClose }: { identifier: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!identifier) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === 'Escape' && !['INPUT', 'TEXTAREA'].includes(t.tagName)) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [identifier, onClose]);

  return (
    <AnimatePresence>
      {identifier && (
        <>
          <motion.div className="fixed inset-0 z-30 bg-brand-950/20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            className="fixed inset-y-0 right-0 z-40 w-full max-w-4xl overflow-y-auto border-l border-line bg-bg shadow-2xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
          >
            <IssueDetail identifier={identifier} onClose={onClose} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

export function IssueDetail({ identifier, onClose }: { identifier: string; onClose?: () => void }) {
  const { data: issue, isLoading } = useIssue(identifier);
  if (isLoading) return <PageLoader />;
  if (!issue) {
    return (
      <Empty title="Issue not found">
        {identifier} doesn't exist or belongs to a team you're not on.
      </Empty>
    );
  }
  return <IssueBody key={issue.id} issue={issue} onClose={onClose} />;
}

function IssueBody({ issue, onClose }: { issue: Issue; onClose?: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const ui = useUI();
  const update = useUpdateIssue();
  const setLabels = useSetIssueLabels();
  const bundle = useTeamBundle(issue.team_id);
  const { data: teams = [] } = useTeams();
  const team = teams.find((t) => t.id === issue.team_id);
  const { data: milestones = [] } = useMilestones(issue.project_id ? [issue.project_id] : undefined);
  const { data: subIssues = [] } = useIssues({ parentId: issue.id });
  const { data: prs = [] } = useIssuePullRequests(issue.id);
  const { data: parent } = useQuery({
    queryKey: ['issue-parent', issue.parent_id],
    enabled: !!issue.parent_id,
    queryFn: async () =>
      unwrap(await supabase.from('issues').select('identifier, title').eq('id', issue.parent_id!).maybeSingle()) as
        | Pick<Issue, 'identifier' | 'title'>
        | null,
  });

  const [title, setTitle] = useState(issue.title);
  const [desc, setDesc] = useState(issue.description);
  useEffect(() => setTitle(issue.title), [issue.title]);
  useEffect(() => setDesc(issue.description), [issue.description]);

  const patch = (p: Partial<Issue>) => update.mutate({ id: issue.id, patch: p });
  const labelIds = (issue.issue_labels ?? []).map((l) => l.label_id);

  const copy = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${what}`);
  };

  const remove = async () => {
    if (!confirm(`Delete ${issue.identifier}? The GitHub issue stays open on GitHub.`)) return;
    unwrap(await supabase.from('issues').delete().eq('id', issue.id));
    qc.invalidateQueries({ queryKey: ['issues'] });
    toast.success(`Deleted ${issue.identifier}`);
    if (onClose) onClose();
    else navigate(team ? `/team/${team.key}/board` : '/');
  };

  return (
    <div className="flex min-h-full flex-col">
      {/* header */}
      <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg/90 px-5 py-2.5 text-sm backdrop-blur">
        {team && (
          <Link to={`/team/${team.key}/board`} className="text-muted hover:text-ink">
            {team.emoji} {team.name}
          </Link>
        )}
        <span className="text-muted">/</span>
        <span className="font-mono font-medium">{issue.identifier}</span>
        <div className="ml-auto flex items-center gap-1">
          <IconBtn label="Copy branch name" onClick={() => copy(branchName(issue.identifier, issue.title), 'branch name')}>
            <GitBranch className="size-4" />
          </IconBtn>
          <IconBtn label="Copy link" onClick={() => copy(location.href.split('#')[0] + `#/issue/${issue.identifier}`, 'link')}>
            <Link2 className="size-4" />
          </IconBtn>
          {issue.github_url && (
            <a href={issue.github_url} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink" title="Open on GitHub">
              <Github className="size-4" />
            </a>
          )}
          {onClose && (
            <>
              <IconBtn label="Open full page" onClick={() => navigate(`/issue/${issue.identifier}`)}>
                <Maximize2 className="size-4" />
              </IconBtn>
              <IconBtn label="Close" onClick={onClose}>
                <X className="size-4" />
              </IconBtn>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col lg:flex-row">
        {/* main column */}
        <div className="min-w-0 flex-1 space-y-6 px-5 py-6 sm:px-8">
          {parent && (
            <Link to={`/issue/${parent.identifier}`} className="-mb-4 inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink">
              Sub-issue of <span className="font-mono">{parent.identifier}</span> {parent.title}
            </Link>
          )}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== issue.title && patch({ title: title.trim() })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="w-full bg-transparent font-display text-2xl font-bold outline-none"
            aria-label="Title"
          />
          <MarkdownEditor
            value={desc}
            onChange={setDesc}
            onBlur={() => desc !== issue.description && patch({ description: desc })}
            placeholder="Add a description…"
            startInPreview
          />

          {/* sub-issues */}
          <section>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-sm font-semibold">Sub-issues</h3>
              {subIssues.length > 0 && (
                <span className="text-xs text-muted">
                  {subIssues.filter((s) => bundle.stateById.get(s.state_id)?.category === 'completed').length}/{subIssues.length} done
                </span>
              )}
              <button
                onClick={() => ui.openCreateIssue({ team_id: issue.team_id, parent_id: issue.id, project_id: issue.project_id, cycle_id: issue.cycle_id })}
                className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-ink"
              >
                <Plus className="size-3.5" /> Add sub-issue
              </button>
            </div>
            {subIssues.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-line bg-surface">
                {subIssues.map((s) => <IssueRow key={s.id} issue={s} bundle={bundle} showCycle={false} />)}
              </div>
            )}
          </section>

          {/* pull requests */}
          {prs.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">Pull requests</h3>
              <div className="space-y-1.5">
                {prs.map((pr) => (
                  <a
                    key={pr.id}
                    href={pr.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2 text-sm hover:border-brand-300"
                  >
                    {pr.state === 'merged' ? (
                      <GitMerge className="size-4 text-purple-500" />
                    ) : (
                      <GitPullRequest className={cn('size-4', pr.state === 'closed' ? 'text-red-500' : pr.state === 'draft' ? 'text-muted' : 'text-brand-500')} />
                    )}
                    <span className="text-muted">#{pr.number}</span>
                    <span className="min-w-0 flex-1 truncate">{pr.title}</span>
                    {pr.review_state === 'approved' && <Badge color="#2ead5b"><Check className="size-3" /> Approved</Badge>}
                    {pr.review_state === 'changes_requested' && <Badge color="#ef4444">Changes requested</Badge>}
                    {pr.review_state === 'pending' && <Badge color="#eab308">Review pending</Badge>}
                    <span className="text-xs text-muted">@{pr.author_login}</span>
                    <ExternalLink className="size-3.5 text-muted" />
                  </a>
                ))}
              </div>
            </section>
          )}

          <Conversation issue={issue} />
        </div>

        {/* properties */}
        <aside className="shrink-0 space-y-4 border-line px-5 pb-8 lg:w-72 lg:border-l lg:py-6">
          <Prop label="Status"><StatePicker states={bundle.states} value={issue.state_id} onChange={(state_id) => patch({ state_id })} /></Prop>
          <Prop label="Priority"><PriorityPicker value={issue.priority} onChange={(priority) => patch({ priority })} /></Prop>
          <Prop label="Assignee"><AssigneePicker people={bundle.people} value={issue.assignee_id} onChange={(assignee_id) => patch({ assignee_id })} /></Prop>
          <Prop label="Labels">
            <LabelPicker
              labels={bundle.labels}
              value={labelIds}
              onChange={(ids) =>
                setLabels.mutate({ issueId: issue.id, add: ids.filter((x) => !labelIds.includes(x)), remove: labelIds.filter((x) => !ids.includes(x)) })
              }
            />
          </Prop>
          <Prop label="Estimate"><EstimateInput value={issue.estimate} onChange={(estimate) => patch({ estimate })} /></Prop>
          <Prop label="Due date"><DueDateInput value={issue.due_date} onChange={(due_date) => patch({ due_date })} /></Prop>
          <Prop label="Sprint"><CyclePicker cycles={bundle.cycles} value={issue.cycle_id} onChange={(cycle_id) => patch({ cycle_id })} /></Prop>
          <Prop label="Project">
            <ProjectPicker projects={bundle.projects} value={issue.project_id} onChange={(project_id) => patch({ project_id, milestone_id: null })} />
          </Prop>
          {issue.project_id && milestones.length > 0 && (
            <Prop label="Milestone">
              <Picker
                value={issue.milestone_id}
                onChange={(milestone_id) => patch({ milestone_id })}
                options={[{ value: '', label: 'No milestone' }, ...milestones.map((m) => ({ value: m.id, label: m.name, icon: <span>◆</span> }))]}
                trigger={<Chip muted={!issue.milestone_id}>◆ {milestones.find((m) => m.id === issue.milestone_id)?.name ?? 'Milestone'}</Chip>}
              />
            </Prop>
          )}

          <div className="space-y-1.5 rounded-xl border border-line bg-surface p-3 text-xs text-muted">
            <div className="flex items-center gap-1.5 font-medium text-ink">
              <Github className="size-3.5" /> GitHub
            </div>
            {issue.github_url ? (
              <>
                <a href={issue.github_url} target="_blank" rel="noreferrer" className="block truncate text-brand-600 hover:underline dark:text-brand-400">
                  {issue.github_url.replace('https://github.com/', '')}
                </a>
                {issue.last_synced_at && <div>Synced {ago(issue.last_synced_at)}</div>}
              </>
            ) : issue.repo_id ? (
              <div>Creating on GitHub…</div>
            ) : (
              <div>Not synced. Link a repo in team settings to sync new issues.</div>
            )}
            <button
              onClick={() => copy(branchName(issue.identifier, issue.title), 'branch name')}
              className="flex w-full items-center gap-1.5 rounded-lg bg-surface-2 px-2 py-1.5 text-left font-mono text-[11px] text-ink hover:bg-line"
              title="Name your branch this and PRs link automatically"
            >
              <GitBranch className="size-3 shrink-0" />
              <span className="truncate">{branchName(issue.identifier, issue.title)}</span>
              <Copy className="ml-auto size-3 shrink-0" />
            </button>
          </div>

          <div className="text-xs text-muted">
            Created {ago(issue.created_at)} · Updated {ago(issue.updated_at)}
          </div>
          <Button variant="ghost" size="sm" onClick={remove} className="text-red-600" icon={<Trash2 className="size-3.5" />}>
            Delete issue
          </Button>
        </aside>
      </div>
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink">
      {children}
    </button>
  );
}

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 lg:flex-col lg:items-start lg:gap-1">
      <div className="w-20 shrink-0 text-xs font-medium text-muted">{label}</div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comments + activity
// ---------------------------------------------------------------------------

function describe(a: Activity): React.ReactNode {
  const d = a.data as Record<string, string | number | boolean | null>;
  switch (a.verb) {
    case 'created':
      return 'created the issue';
    case 'state_changed':
      return <>moved from <b>{d.from}</b> to <b>{d.to}</b></>;
    case 'assigned':
      return d.person ? <>assigned to <b>{d.person}</b></> : 'removed the assignee';
    case 'priority_changed':
      return <>set priority to <b>{PRIORITIES[Number(d.to)]?.label}</b></>;
    case 'cycle_changed':
      return d.cycle ? <>added to <b>Sprint {d.cycle}</b></> : 'removed from the sprint';
    case 'pull_request':
      return <>{d.action === 'merged' ? 'merged' : String(d.action).replace(/_/g, ' ')} PR <a className="underline" href={String(d.url)} target="_blank" rel="noreferrer">#{d.number}</a></>;
    case 'commit':
      return <>referenced this in <a className="font-mono underline" href={String(d.url)} target="_blank" rel="noreferrer">{d.sha}</a> “{d.message}”</>;
    default:
      return null;
  }
}

function Conversation({ issue }: { issue: Issue }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { data: comments = [] } = useComments(issue.id);
  const { data: activity = [] } = useActivity({ issueId: issue.id, limit: 100 });
  const { data: profiles = [] } = useProfiles();
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const ch = supabase
      .channel(`comments-${issue.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `issue_id=eq.${issue.id}` }, () =>
        qc.invalidateQueries({ queryKey: ['comments', issue.id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [issue.id, qc]);

  type Item = { kind: 'comment'; at: string; c: Comment } | { kind: 'activity'; at: string; a: Activity };
  const items: Item[] = [
    ...comments.map((c) => ({ kind: 'comment' as const, at: c.created_at, c })),
    ...activity.filter((a) => a.verb !== 'commented').map((a) => ({ kind: 'activity' as const, at: a.created_at, a })),
  ].sort((x, y) => x.at.localeCompare(y.at));

  const send = async () => {
    if (!body.trim() || !profile) return;
    setSending(true);
    try {
      unwrap(await supabase.from('comments').insert({ issue_id: issue.id, author_id: profile.id, body, is_internal: internal }));
      setBody('');
      qc.invalidateQueries({ queryKey: ['comments', issue.id] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold">Activity</h3>
      <div className="space-y-3">
        {items.map((it) =>
          it.kind === 'activity' ? (
            describe(it.a) && (
              <div key={`a${it.a.id}`} className="flex items-center gap-2 pl-1 text-xs text-muted">
                <span className="size-1.5 rounded-full bg-line" />
                <b className="font-medium text-ink/80">
                  {it.a.actor_id ? profileById.get(it.a.actor_id)?.name ?? 'Someone' : it.a.actor_github_login ? `@${it.a.actor_github_login}` : 'GitHub'}
                </b>
                {describe(it.a)}
                <span>· {ago(it.a.created_at)}</span>
              </div>
            )
          ) : (
            <div
              key={it.c.id}
              className={cn('rounded-xl border p-3', it.c.is_internal ? 'border-amber-300/60 bg-amber-50/60 dark:bg-amber-500/5' : 'border-line bg-surface')}
            >
              <div className="mb-1 flex items-center gap-2 text-xs">
                <Avatar
                  name={it.c.author_id ? profileById.get(it.c.author_id)?.name : it.c.github_author_login}
                  src={it.c.author_id ? profileById.get(it.c.author_id)?.avatar_url : `https://github.com/${it.c.github_author_login}.png?size=40`}
                  size={18}
                />
                <b>{it.c.author_id ? profileById.get(it.c.author_id)?.name : `@${it.c.github_author_login}`}</b>
                {it.c.github_author_login && !it.c.author_id && <Github className="size-3 text-muted" />}
                {it.c.is_internal && <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400"><Lock className="size-3" /> Leadership only</span>}
                <span className="text-muted">{ago(it.c.created_at)}</span>
              </div>
              <Markdown>{it.c.body}</Markdown>
            </div>
          ),
        )}
      </div>

      <div className="mt-4 rounded-xl border border-line bg-surface p-2 focus-within:border-brand-400">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}
          placeholder={internal ? 'Leave a note only leadership can see…' : issue.github_url ? 'Comment (also posted on GitHub)…' : 'Leave a comment…'}
          rows={3}
          className="border-none focus:ring-0"
        />
        <div className="flex items-center gap-2 px-1">
          <label className="flex items-center gap-2 text-xs text-muted">
            <Switch checked={internal} onChange={setInternal} label="Leadership only" />
            <Lock className="size-3" /> Leadership only
          </label>
          <Button size="sm" variant="primary" className="ml-auto" onClick={send} loading={sending} disabled={!body.trim()}>
            Comment
          </Button>
        </div>
      </div>
    </section>
  );
}
