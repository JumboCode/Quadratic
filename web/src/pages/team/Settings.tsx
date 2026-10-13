import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Bell, Download, Github, Hash, MailCheck, Plus, Send, Star, Trash2, UserPlus, Users, Workflow,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import {
  useDb, useInvites, useMembers, useNotificationSettings, useRepos, useTemplates,
} from '../../lib/queries';
import { callFunction, supabase, unwrap } from '../../lib/supabase';
import type { NotificationSettings, Person, Repo, TeamRole, WorkflowState } from '../../lib/types';
import { ago, cn, COLORS, PRIORITIES, ROLE_LABEL, STATE_ORDER, TEAM_EMOJIS } from '../../lib/utils';
import { Avatar, Badge, Button, Card, Field, Input, Select, Switch, Tabs, Textarea } from '../../components/ui';
import { StateIcon } from '../../components/icons';
import { useTeamCtx } from './TeamLayout';

type Tab = 'general' | 'members' | 'people' | 'github' | 'workflow' | 'notifications';

export function Settings() {
  const { tab = 'general' } = useParams();
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <Tabs<Tab>
        value={tab as Tab}
        onChange={(t) => navigate(`../settings/${t}`, { relative: 'path', replace: true })}
        tabs={[
          { value: 'general', label: 'General' },
          { value: 'members', label: <span className="flex items-center gap-1.5"><Users className="size-3.5" /> Leadership</span> },
          { value: 'people', label: 'Developers' },
          { value: 'github', label: <span className="flex items-center gap-1.5"><Github className="size-3.5" /> GitHub</span> },
          { value: 'workflow', label: <span className="flex items-center gap-1.5"><Workflow className="size-3.5" /> Workflow</span> },
          { value: 'notifications', label: <span className="flex items-center gap-1.5"><Bell className="size-3.5" /> Slack</span> },
        ]}
      />
      {tab === 'general' && <General />}
      {tab === 'members' && <Members />}
      {tab === 'people' && <People />}
      {tab === 'github' && <GithubSettings />}
      {tab === 'workflow' && <WorkflowSettings />}
      {tab === 'notifications' && <Notifications />}
    </div>
  );
}

function Section({ title, description, children, action }: { title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex-1">
          <h3 className="font-display text-lg font-bold">{title}</h3>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function General() {
  const { team } = useTeamCtx();
  const { profile } = useAuth();
  const db = useDb([['teams']], 'Saved');
  const [form, setForm] = useState({ name: team.name, description: team.description ?? '', academic_year: team.academic_year ?? '', emoji: team.emoji, color: team.color });

  return (
    <div className="space-y-5">
      <Section title="Team profile">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Academic year" hint="e.g. 2026–27"><Input value={form.academic_year} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} /></Field>
          </div>
          <Field label="Description"><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Who's the client? What are you building?" /></Field>
          <Field label="Icon">
            <div className="flex flex-wrap gap-1">
              {TEAM_EMOJIS.map((e) => (
                <button key={e} onClick={() => setForm({ ...form, emoji: e })} className={cn('size-9 rounded-lg text-lg transition hover:bg-surface-2', form.emoji === e && 'bg-brand-500/15 ring-2 ring-brand-400')}>{e}</button>
              ))}
            </div>
          </Field>
          <Field label="Color">
            <div className="flex gap-1.5">
              {COLORS.map((c) => (
                <button key={c} onClick={() => setForm({ ...form, color: c })} aria-label={c} className={cn('size-7 rounded-full', form.color === c && 'ring-2 ring-ink ring-offset-2 ring-offset-surface')} style={{ background: c }} />
              ))}
            </div>
          </Field>
          <div className="flex justify-end">
            <Button variant="primary" loading={db.isPending} onClick={() => db.mutate({ op: 'update', table: 'teams', match: { id: team.id }, values: { ...form, description: form.description || null, academic_year: form.academic_year || null } })}>
              Save changes
            </Button>
          </div>
        </div>
      </Section>
      {profile?.is_admin && (
        <Section title="Archive" description="Archived teams are hidden from the sidebar and stop sending Slack notifications. Their history is kept.">
          <Button
            variant={team.archived ? 'secondary' : 'danger'}
            onClick={() => db.mutate({ op: 'update', table: 'teams', match: { id: team.id }, values: { archived: !team.archived } })}
          >
            {team.archived ? 'Unarchive team' : 'Archive team'}
          </Button>
        </Section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Members() {
  const { team } = useTeamCtx();
  const { profile } = useAuth();
  const { data: members = [] } = useMembers(team.id);
  const { data: invites = [] } = useInvites(team.id);
  const db = useDb([['team_members', team.id], ['invites', team.id], ['me']]);
  const [login, setLogin] = useState('');
  const [role, setRole] = useState<TeamRole>('pm');

  const invite = async () => {
    const clean = login.trim().replace(/^@/, '');
    if (!clean) return;
    await db.mutateAsync({ op: 'insert', table: 'invites', values: { team_id: team.id, github_login: clean, role, invited_by: profile?.id } });
    toast.success(`Invited @${clean}`, { description: 'They get access as soon as they sign in with GitHub.' });
    setLogin('');
  };

  return (
    <div className="space-y-5">
      <Section title="Leadership" description="PMs, tech leads and designers who can sign in and plan. Devs don't need accounts.">
        <div className="divide-y divide-line">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center gap-3 py-2.5">
              <Avatar name={m.profile?.name} src={m.profile?.avatar_url} size={32} />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{m.profile?.name}</div>
                <div className="text-xs text-muted">@{m.profile?.github_login}</div>
              </div>
              <Select
                value={m.role}
                onChange={(e) => db.mutate({ op: 'update', table: 'team_members', match: { team_id: team.id, user_id: m.user_id }, values: { role: e.target.value } })}
                className="h-8 text-[13px]"
              >
                {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
              <button
                onClick={() => confirm(`Remove ${m.profile?.name} from ${team.name}?`) && db.mutate({ op: 'delete', table: 'team_members', match: { team_id: team.id, user_id: m.user_id } })}
                className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-red-600"
                aria-label="Remove member"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          {members.length === 0 && <p className="py-3 text-sm text-muted">No leads yet. Invite someone below.</p>}
        </div>
      </Section>
      <Section title="Invite" description="Invite by GitHub username. If they've already signed in, they're added immediately.">
        <div className="flex flex-wrap gap-2">
          <Input value={login} onChange={(e) => setLogin(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && invite()} placeholder="GitHub username" className="max-w-xs" />
          <Select value={role} onChange={(e) => setRole(e.target.value as TeamRole)}>
            {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Button variant="primary" onClick={invite} loading={db.isPending} icon={<UserPlus className="size-4" />}>Invite</Button>
        </div>
        {invites.length > 0 && (
          <div className="mt-4 space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted">Pending</div>
            {invites.map((i) => (
              <div key={i.id} className="flex items-center gap-2 text-sm">
                <MailCheck className="size-4 text-muted" />
                @{i.github_login} <Badge>{i.role && ROLE_LABEL[i.role]}</Badge>
                <span className="text-xs text-muted">{ago(i.created_at)}</span>
                <button onClick={() => db.mutate({ op: 'delete', table: 'invites', match: { id: i.id } })} className="ml-auto text-xs text-muted hover:text-red-600">Revoke</button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function People() {
  const { team, bundle } = useTeamCtx();
  const qc = useQueryClient();
  const db = useDb([['people', team.id]]);
  const [draft, setDraft] = useState({ name: '', github_login: '', email: '' });
  const [matching, setMatching] = useState(false);

  const add = async () => {
    if (!draft.name.trim()) return;
    await db.mutateAsync({
      op: 'insert',
      table: 'people',
      values: { team_id: team.id, name: draft.name.trim(), github_login: draft.github_login.replace(/^@/, '').trim() || null, email: draft.email.trim() || null },
    });
    setDraft({ name: '', github_login: '', email: '' });
  };

  const save = (p: Person, values: Partial<Person>) => db.mutate({ op: 'update', table: 'people', match: { id: p.id }, values });

  const matchSlack = async () => {
    setMatching(true);
    try {
      const r = await callFunction<{ matched: number; missing: string[] }>('slack-api', { action: 'match_people', team_id: team.id });
      toast.success(`Matched ${r.matched} dev${r.matched === 1 ? '' : 's'} to Slack`, {
        description: r.missing.length ? `Not found in Slack: ${r.missing.join(', ')}` : undefined,
      });
      qc.invalidateQueries({ queryKey: ['people', team.id] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setMatching(false);
    }
  };

  return (
    <Section
      title="Developers"
      description="Your team's devs. Assign issues to them; GitHub usernames sync assignees, Slack IDs power reminder DMs."
      action={<Button size="sm" onClick={matchSlack} loading={matching} icon={<Hash className="size-3.5" />}>Match Slack by email</Button>}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">GitHub</th>
              <th className="pb-2 font-medium">Email</th>
              <th className="pb-2 font-medium">Slack</th>
              <th className="pb-2 font-medium">Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {bundle.people.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="py-1.5 pr-2"><InlineInput value={p.name} onSave={(name) => name && save(p, { name })} /></td>
                <td className="py-1.5 pr-2"><InlineInput value={p.github_login ?? ''} placeholder="username" onSave={(v) => save(p, { github_login: v.replace(/^@/, '') || null })} /></td>
                <td className="py-1.5 pr-2"><InlineInput value={p.email ?? ''} placeholder="name@tufts.edu" onSave={(v) => save(p, { email: v || null })} /></td>
                <td className="py-1.5 pr-2">
                  <InlineInput value={p.slack_user_id ?? ''} placeholder="U0123…" onSave={(v) => save(p, { slack_user_id: v || null })} />
                </td>
                <td className="py-1.5"><Switch checked={p.active} onChange={(active) => save(p, { active })} label="Active" /></td>
                <td className="py-1.5 text-right">
                  <button onClick={() => confirm(`Remove ${p.name}?`) && db.mutate({ op: 'delete', table: 'people', match: { id: p.id } })} className="rounded p-1 text-muted hover:text-red-600" aria-label="Remove">
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <Input placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <Input placeholder="GitHub username" value={draft.github_login} onChange={(e) => setDraft({ ...draft, github_login: e.target.value })} />
        <Input placeholder="Tufts email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <Button variant="primary" onClick={add} icon={<Plus className="size-4" />}>Add dev</Button>
      </div>
    </Section>
  );
}

function InlineInput({ value, onSave, placeholder }: { value: string; onSave: (v: string) => void; placeholder?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onSave(v.trim())}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="h-8 w-full min-w-28 rounded-lg border border-transparent bg-transparent px-2 outline-none hover:border-line focus:border-brand-400 focus:bg-surface"
    />
  );
}

// ---------------------------------------------------------------------------

interface AvailableRepo {
  github_repo_id: number;
  installation_id: number;
  full_name: string;
  default_branch: string;
  private: boolean;
}

function GithubSettings() {
  const { team, bundle } = useTeamCtx();
  const qc = useQueryClient();
  const { data: repos = [] } = useRepos(team.id);
  const db = useDb([['repos', team.id], ['teams']]);
  const status = useQuery({
    queryKey: ['github-status'],
    queryFn: () => callFunction<{ slug: string; installUrl: string; installations: { id: number; account: string | null }[] }>('github-api', { action: 'status' }),
    retry: false,
  });
  const available = useQuery({
    queryKey: ['github-repos'],
    enabled: status.isSuccess,
    queryFn: () => callFunction<{ repos: AvailableRepo[] }>('github-api', { action: 'list_repos' }),
  });
  const [pick, setPick] = useState('');
  const [importing, setImporting] = useState<string | null>(null);

  const link = async () => {
    const r = available.data?.repos.find((x) => String(x.github_repo_id) === pick);
    if (!r) return;
    await db.mutateAsync({
      op: 'insert',
      table: 'repos',
      values: { team_id: team.id, github_repo_id: r.github_repo_id, installation_id: r.installation_id, full_name: r.full_name, default_branch: r.default_branch, is_default: repos.length === 0 },
    });
    setPick('');
    toast.success(`Linked ${r.full_name}`, { description: 'Want its existing issues? Hit “Import issues”.' });
  };

  const makeDefault = async (r: Repo) => {
    unwrap(await supabase.from('repos').update({ is_default: false }).eq('team_id', team.id));
    unwrap(await supabase.from('repos').update({ is_default: true }).eq('id', r.id));
    qc.invalidateQueries({ queryKey: ['repos', team.id] });
  };

  const importIssues = async (r: Repo) => {
    setImporting(r.id);
    try {
      const res = await callFunction<{ imported: number }>('github-api', { action: 'import_issues', repo_id: r.id });
      toast.success(`Imported ${res.imported} issues from ${r.full_name}`);
      qc.invalidateQueries({ queryKey: ['issues'] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(null);
    }
  };

  const linkedIds = new Set(repos.map((r) => r.github_repo_id));
  const ordered = [...bundle.states].sort((a, b) => STATE_ORDER.indexOf(a.category) - STATE_ORDER.indexOf(b.category));
  const stateSelect = (field: 'pr_opened_state_id' | 'pr_review_state_id' | 'pr_merged_state_id', label: string) => (
    <Field label={label}>
      <Select
        value={team[field] ?? ''}
        onChange={(e) => db.mutate({ op: 'update', table: 'teams', match: { id: team.id }, values: { [field]: e.target.value || null } })}
        className="w-full"
      >
        <option value="">Don't change status</option>
        {ordered.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select>
    </Field>
  );

  return (
    <div className="space-y-5">
      <Section title="Repositories" description="New issues are created in the default repo. Issues opened directly on GitHub land in Triage.">
        {status.isError && (
          <div className="mb-4 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
            The GitHub App isn't configured yet ({(status.error as Error).message}). An admin needs to finish setup (docs/SETUP.md).
          </div>
        )}
        <div className="space-y-2">
          {repos.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2">
              <Github className="size-4" />
              <a href={`https://github.com/${r.full_name}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">{r.full_name}</a>
              {r.is_default ? <Badge color="#2ead5b"><Star className="size-3" /> Default</Badge> : (
                <button onClick={() => makeDefault(r)} className="text-xs text-muted hover:text-ink">Make default</button>
              )}
              <div className="ml-auto flex gap-1">
                <Button size="sm" onClick={() => importIssues(r)} loading={importing === r.id} icon={<Download className="size-3.5" />}>Import issues</Button>
                <Button size="sm" variant="ghost" onClick={() => confirm(`Unlink ${r.full_name}? Existing issues stay but stop syncing.`) && db.mutate({ op: 'delete', table: 'repos', match: { id: r.id } })} aria-label="Unlink">
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
          {repos.length === 0 && <p className="text-sm text-muted">No repos linked. Issues will be planner-only until you link one.</p>}
        </div>
        {status.isSuccess && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Select value={pick} onChange={(e) => setPick(e.target.value)} className="min-w-64 flex-1">
              <option value="">{available.isLoading ? 'Loading repos…' : 'Choose a repo to link…'}</option>
              {available.data?.repos.filter((r) => !linkedIds.has(r.github_repo_id)).map((r) => (
                <option key={r.github_repo_id} value={r.github_repo_id}>{r.full_name}{r.private ? ' 🔒' : ''}</option>
              ))}
            </Select>
            <Button variant="primary" onClick={link} disabled={!pick}>Link repo</Button>
            <a href={status.data.installUrl} target="_blank" rel="noreferrer" className="self-center text-xs text-muted underline">Repo missing? Grant the App access</a>
          </div>
        )}
      </Section>
      <Section title="Pull request automation" description="Move linked issues automatically. PRs link by “closes #12”, by the issue ID (WEB-12) in the title, or by branch name.">
        <div className="grid gap-4 sm:grid-cols-3">
          {stateSelect('pr_opened_state_id', 'When a PR is opened')}
          {stateSelect('pr_review_state_id', 'When review is requested')}
          {stateSelect('pr_merged_state_id', 'When merged to default branch')}
        </div>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function WorkflowSettings() {
  const { team, bundle } = useTeamCtx();
  const db = useDb([['workflow_states', team.id], ['labels', team.id], ['issue_templates', team.id]]);
  const { data: templates = [] } = useTemplates(team.id);
  const [newState, setNewState] = useState<{ name: string; category: WorkflowState['category'] }>({ name: '', category: 'started' });
  const [newLabel, setNewLabel] = useState({ name: '', color: COLORS[2] });
  const [tpl, setTpl] = useState({ name: '', title: '', description: '', priority: 0 });

  const states = [...bundle.states].sort((a, b) => STATE_ORDER.indexOf(a.category) - STATE_ORDER.indexOf(b.category) || a.position - b.position);

  return (
    <div className="space-y-5">
      <Section title="Statuses" description="Columns on your board. Categories decide how GitHub sync and sprint stats treat them.">
        <div className="space-y-1.5">
          {states.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <input type="color" value={s.color} onChange={(e) => db.mutate({ op: 'update', table: 'workflow_states', match: { id: s.id }, values: { color: e.target.value } })} className="size-7 cursor-pointer rounded border-0 bg-transparent" aria-label="Color" />
              <StateIcon category={s.category} color={s.color} />
              <InlineInput value={s.name} onSave={(name) => name && db.mutate({ op: 'update', table: 'workflow_states', match: { id: s.id }, values: { name } })} />
              <span className="w-24 shrink-0 text-xs text-muted">{s.category}</span>
              <button
                onClick={() => confirm(`Delete status "${s.name}"? Only works if no issues use it.`) && db.mutate({ op: 'delete', table: 'workflow_states', match: { id: s.id } })}
                className="rounded p-1 text-muted hover:text-red-600"
                aria-label="Delete status"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Input value={newState.name} onChange={(e) => setNewState({ ...newState, name: e.target.value })} placeholder="New status, e.g. “QA”" />
          <Select value={newState.category} onChange={(e) => setNewState({ ...newState, category: e.target.value as WorkflowState['category'] })}>
            {STATE_ORDER.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Button
            onClick={() => newState.name.trim() && db.mutateAsync({ op: 'insert', table: 'workflow_states', values: { team_id: team.id, name: newState.name.trim(), category: newState.category, color: '#64748b', position: states.length } }).then(() => setNewState({ ...newState, name: '' }))}
            icon={<Plus className="size-4" />}
          >
            Add
          </Button>
        </div>
      </Section>

      <Section title="Labels" description="Synced to GitHub labels by name.">
        <div className="flex flex-wrap gap-2">
          {bundle.labels.map((l) => (
            <span key={l.id} className="group inline-flex items-center gap-1.5 rounded-full border border-line py-1 pl-2.5 pr-1.5 text-sm">
              <span className="size-2.5 rounded-full" style={{ background: l.color }} />
              {l.name}
              <button onClick={() => db.mutate({ op: 'delete', table: 'labels', match: { id: l.id } })} className="rounded-full p-0.5 text-muted opacity-0 hover:text-red-600 group-hover:opacity-100" aria-label={`Delete ${l.name}`}>
                <Trash2 className="size-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input type="color" value={newLabel.color} onChange={(e) => setNewLabel({ ...newLabel, color: e.target.value })} className="h-9 w-10 cursor-pointer rounded border-0 bg-transparent" aria-label="Label color" />
          <Input value={newLabel.name} onChange={(e) => setNewLabel({ ...newLabel, name: e.target.value })} placeholder="New label" />
          <Button
            onClick={() => newLabel.name.trim() && db.mutateAsync({ op: 'insert', table: 'labels', values: { team_id: team.id, name: newLabel.name.trim(), color: newLabel.color } }).then(() => setNewLabel({ ...newLabel, name: '' }))}
            icon={<Plus className="size-4" />}
          >
            Add
          </Button>
        </div>
      </Section>

      <Section title="Issue templates" description="Pre-filled issues for common work. Pick one when creating an issue.">
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
              <span className="font-medium">{t.name}</span>
              <span className="truncate text-muted">{t.title}</span>
              <button onClick={() => db.mutate({ op: 'delete', table: 'issue_templates', match: { id: t.id } })} className="ml-auto rounded p-1 text-muted hover:text-red-600" aria-label="Delete template">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-2 rounded-xl bg-surface-2 p-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <Input value={tpl.name} onChange={(e) => setTpl({ ...tpl, name: e.target.value })} placeholder="Template name" />
            <Input value={tpl.title} onChange={(e) => setTpl({ ...tpl, title: e.target.value })} placeholder="Title prefix, e.g. [Bug]" />
            <Select value={tpl.priority} onChange={(e) => setTpl({ ...tpl, priority: Number(e.target.value) })}>
              {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </Select>
          </div>
          <Textarea rows={4} value={tpl.description} onChange={(e) => setTpl({ ...tpl, description: e.target.value })} placeholder="Description template (markdown)" className="font-mono text-[13px]" />
          <Button
            onClick={() => tpl.name.trim() && db.mutateAsync({ op: 'insert', table: 'issue_templates', values: { team_id: team.id, ...tpl } }).then(() => setTpl({ name: '', title: '', description: '', priority: 0 }))}
            icon={<Plus className="size-4" />}
          >
            Add template
          </Button>
        </div>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------

const TIMEZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Asia/Kolkata', 'Asia/Shanghai'];

function Notifications() {
  const { team } = useTeamCtx();
  const { data: settings } = useNotificationSettings(team.id);
  const db = useDb([['notification_settings', team.id], ['teams']]);
  const status = useQuery({ queryKey: ['integration-status'], queryFn: async () => unwrap(await supabase.rpc('integration_status')) as { slack: { team_name: string } | null } });
  const channels = useQuery({
    queryKey: ['slack-channels'],
    enabled: !!status.data?.slack,
    queryFn: () => callFunction<{ channels: { id: string; name: string }[] }>('slack-api', { action: 'channels' }),
  });
  const [testing, setTesting] = useState(false);

  if (!settings) return null;
  const set = (values: Partial<NotificationSettings>) => db.mutate({ op: 'update', table: 'notification_settings', match: { team_id: team.id }, values });

  const toggle = (key: keyof NotificationSettings, title: string, description: string, extra?: React.ReactNode) => (
    <div className="flex items-start gap-3 py-3">
      <div className="flex-1">
        <div className="font-medium">{title}</div>
        <div className="text-sm text-muted">{description}</div>
        {extra && settings[key] && <div className="mt-2">{extra}</div>}
      </div>
      <Switch checked={settings[key] as boolean} onChange={(v) => set({ [key]: v })} label={title} />
    </div>
  );

  const sendTest = async () => {
    setTesting(true);
    try {
      await callFunction('slack-api', { action: 'test', team_id: team.id });
      toast.success('Test message sent! Check Slack 👀');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-5">
      <Section title="Slack channel" description="Where sprint digests and the activity feed are posted. Reminders go to devs as DMs.">
        {!status.data?.slack ? (
          <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">Slack isn't connected yet. A club admin can connect it from the Admin page.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={team.slack_channel_id ?? ''}
              onChange={(e) => {
                const ch = channels.data?.channels.find((c) => c.id === e.target.value);
                db.mutate({ op: 'update', table: 'teams', match: { id: team.id }, values: { slack_channel_id: ch?.id ?? null, slack_channel_name: ch?.name ?? null } });
              }}
              className="min-w-64"
            >
              <option value="">{channels.isLoading ? 'Loading channels…' : 'Choose a channel…'}</option>
              {team.slack_channel_id && !channels.data && <option value={team.slack_channel_id}>#{team.slack_channel_name}</option>}
              {channels.data?.channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </Select>
            <Button onClick={sendTest} loading={testing} disabled={!team.slack_channel_id} icon={<Send className="size-4" />}>Send test message</Button>
            <span className="text-xs text-muted">Workspace: {status.data.slack.team_name}</span>
          </div>
        )}
      </Section>

      <Section title="Reminders" description="Direct messages to the assigned dev. Make sure devs have Slack IDs in the Developers tab.">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          Send at
          <Select value={settings.reminder_hour} onChange={(e) => set({ reminder_hour: Number(e.target.value) })} className="h-8">
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{((h + 11) % 12) + 1}:00 {h < 12 ? 'AM' : 'PM'}</option>)}
          </Select>
          <Select value={settings.timezone} onChange={(e) => set({ timezone: e.target.value })} className="h-8">
            {TIMEZONES.map((t) => <option key={t}>{t}</option>)}
          </Select>
        </div>
        <div className="divide-y divide-line">
          {toggle('due_soon_dm', '⏰ Due soon', 'Remind devs before an issue is due.', (
            <label className="flex items-center gap-2 text-sm">
              Remind
              <Select value={settings.due_soon_days} onChange={(e) => set({ due_soon_days: Number(e.target.value) })} className="h-8">
                {[0, 1, 2, 3, 5, 7].map((d) => <option key={d} value={d}>{d === 0 ? 'on the day' : `${d} day${d > 1 ? 's' : ''} before`}</option>)}
              </Select>
            </label>
          ))}
          {toggle('overdue_dm', '🚨 Overdue', 'One nudge when an issue passes its due date.')}
        </div>
      </Section>

      <Section title="Sprint digests" description="Posted to the team channel.">
        <div className="divide-y divide-line">
          {toggle('sprint_start_digest', '🏁 Sprint start', 'Goal, scope and who is working on what.')}
          {toggle('sprint_end_digest', '🏆 Sprint end', 'What got done, what carried over, plus a little celebration.')}
        </div>
      </Section>

      <Section title="Activity feed" description="Real-time posts to the team channel. Turn on only what's useful so the channel stays readable.">
        <div className="divide-y divide-line">
          {toggle('feed_issue_created', '🆕 New issues', 'When an issue is created here or on GitHub.')}
          {toggle('feed_status_changed', '🔁 Status changes', 'Every time an issue moves columns. Can be noisy!')}
          {toggle('feed_pr_opened', '🔧 Pull requests opened', 'When a dev opens a PR.')}
          {toggle('feed_pr_merged', '🎉 Pull requests merged', 'When a PR is merged to the default branch.')}
        </div>
      </Section>
    </div>
  );
}
