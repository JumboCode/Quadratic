import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, CalendarPlus, CheckCircle2, Github, Hash, Plus, Shield, Trash2, UserPlus } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useCalendar, useDb, useInvites, useProfiles, useTeams } from '../lib/queries';
import { callFunction, supabase, unwrap } from '../lib/supabase';
import type { CalendarEvent } from '../lib/types';
import { academicYear, cn, COLORS, fmtDate, TEAM_EMOJIS } from '../lib/utils';
import { Avatar, Badge, Button, Card, Field, Input, Select, Tabs } from '../components/ui';

type Tab = 'teams' | 'people' | 'integrations' | 'calendar';

export function Admin() {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get('slack') ? 'integrations' : 'teams');

  // Result of the Slack OAuth redirect
  useEffect(() => {
    const s = params.get('slack');
    if (!s) return;
    const messages: Record<string, string> = {
      connected: 'Slack connected! 🎉 Now pick a channel in each team’s settings.',
      cancelled: 'Slack connection cancelled.',
      expired: 'That Slack link expired. Please try again.',
      forbidden: 'Only admins can connect Slack.',
      error: 'Slack connection failed. Check the function logs.',
    };
    (s === 'connected' ? toast.success : toast.error)(messages[s] ?? `Slack: ${s}`);
    setParams((p) => { p.delete('slack'); return p; }, { replace: true });
  }, [params, setParams]);

  if (profile && !profile.is_admin) return <Navigate to="/" replace />;

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand-500/15"><Shield className="size-5 text-brand-600" /></span>
        <div>
          <h1 className="font-display text-2xl font-bold">Admin</h1>
          <p className="text-sm text-muted">Club-wide setup: teams, people, integrations and the academic calendar.</p>
        </div>
      </div>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'teams', label: 'Teams' },
          { value: 'people', label: 'People & admins' },
          { value: 'integrations', label: 'Integrations' },
          { value: 'calendar', label: 'Club calendar' },
        ]}
      />
      {tab === 'teams' && <TeamsAdmin />}
      {tab === 'people' && <PeopleAdmin />}
      {tab === 'integrations' && <Integrations />}
      {tab === 'calendar' && <CalendarAdmin />}
    </div>
  );
}

function TeamsAdmin() {
  const { data: teams = [] } = useTeams();
  const qc = useQueryClient();
  const db = useDb([['teams']]);
  const [form, setForm] = useState({ name: '', key: '', emoji: '🐘', color: COLORS[0], academic_year: academicYear() });

  const create = async () => {
    if (!form.name.trim() || !/^[A-Z][A-Z0-9]{1,5}$/.test(form.key)) {
      toast.error('Give the team a name and a 2–6 character key starting with a letter (e.g. WEB).');
      return;
    }
    await db.mutateAsync({ op: 'insert', table: 'teams', values: { ...form, name: form.name.trim() } });
    qc.invalidateQueries({ queryKey: ['me'] });
    toast.success(`${form.emoji} ${form.name} created`, { description: 'Next: invite its leads from the team’s Settings → Leadership.' });
    setForm({ ...form, name: '', key: '' });
  };

  const byYear = new Map<string, typeof teams>();
  teams.forEach((t) => byYear.set(t.academic_year ?? 'No year', [...(byYear.get(t.academic_year ?? 'No year') ?? []), t]));

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h3 className="mb-3 font-display text-lg font-bold">New team</h3>
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem_8rem]">
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                const auto = name.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase();
                setForm({ ...form, name, key: form.key && form.key !== autoKey(form.name) ? form.key : auto });
              }}
              placeholder="e.g. Boston Food Bank"
            />
          </Field>
          <Field label="Key" hint="Issue prefix">
            <Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) })} placeholder="BFB" />
          </Field>
          <Field label="Year">
            <Input value={form.academic_year} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1">
          {TEAM_EMOJIS.map((e) => (
            <button key={e} onClick={() => setForm({ ...form, emoji: e })} className={cn('size-8 rounded-lg text-lg hover:bg-surface-2', form.emoji === e && 'bg-brand-500/15 ring-2 ring-brand-400')}>{e}</button>
          ))}
          <span className="mx-2 h-6 w-px bg-line" />
          {COLORS.map((c) => (
            <button key={c} onClick={() => setForm({ ...form, color: c })} aria-label={c} className={cn('size-6 rounded-full', form.color === c && 'ring-2 ring-ink ring-offset-2 ring-offset-surface')} style={{ background: c }} />
          ))}
          <Button variant="primary" className="ml-auto" onClick={create} loading={db.isPending} icon={<Plus className="size-4" />}>Create team</Button>
        </div>
      </Card>

      {[...byYear.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([year, list]) => (
        <section key={year}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{year}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {list.map((t) => (
              <Card key={t.id} className={cn('flex items-center gap-3 p-3', t.archived && 'opacity-60')}>
                <span className="flex size-9 items-center justify-center rounded-xl text-lg" style={{ background: `${t.color}22` }}>{t.emoji}</span>
                <Link to={`/team/${t.key}/board`} className="min-w-0 flex-1">
                  <div className="truncate font-medium hover:underline">{t.name}</div>
                  <div className="text-xs text-muted">{t.key}{t.archived && ' · archived'}</div>
                </Link>
                <Link to={`/team/${t.key}/settings/members`}><Button size="sm" icon={<UserPlus className="size-3.5" />}>Leads</Button></Link>
                <Button size="sm" variant="ghost" onClick={() => db.mutate({ op: 'update', table: 'teams', match: { id: t.id }, values: { archived: !t.archived } })}>
                  {t.archived ? 'Restore' : 'Archive'}
                </Button>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function autoKey(name: string) {
  return name.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase();
}

function PeopleAdmin() {
  const { profile: me } = useAuth();
  const qc = useQueryClient();
  const { data: profiles = [] } = useProfiles();
  const { data: invites = [] } = useInvites(null);
  const db = useDb([['invites', 'admin']]);
  const [login, setLogin] = useState('');

  const setAdmin = async (id: string, on: boolean) => {
    try {
      unwrap(await supabase.rpc('set_admin', { p_user: id, p_admin: on }));
      qc.invalidateQueries({ queryKey: ['profiles'] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h3 className="font-display text-lg font-bold">Invite an admin</h3>
        <p className="mb-3 text-sm text-muted">Admins (e.g. the JumboCode board) can create teams and see every team.</p>
        <div className="flex gap-2">
          <Input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="GitHub username" className="max-w-xs" />
          <Button
            variant="primary"
            onClick={async () => {
              const clean = login.trim().replace(/^@/, '');
              if (!clean) return;
              await db.mutateAsync({ op: 'insert', table: 'invites', values: { github_login: clean, make_admin: true, invited_by: me?.id } });
              qc.invalidateQueries({ queryKey: ['profiles'] });
              toast.success(`@${clean} will be an admin once they sign in`);
              setLogin('');
            }}
            icon={<UserPlus className="size-4" />}
          >
            Invite
          </Button>
        </div>
        {invites.length > 0 && (
          <div className="mt-3 text-sm text-muted">Pending: {invites.map((i) => `@${i.github_login}`).join(', ')}</div>
        )}
      </Card>
      <Card className="divide-y divide-line">
        {profiles.map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
            <Avatar name={p.name} src={p.avatar_url} size={30} />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-muted">@{p.github_login}</div>
            </div>
            {p.is_admin && <Badge color="#2ead5b"><Shield className="size-3" /> Admin</Badge>}
            {p.id !== me?.id && (
              <Button size="sm" variant="ghost" onClick={() => setAdmin(p.id, !p.is_admin)}>
                {p.is_admin ? 'Remove admin' : 'Make admin'}
              </Button>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}

function Integrations() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ['integration-status'],
    queryFn: async () => unwrap(await supabase.rpc('integration_status')) as { slack: { team_name: string; connected_at: string } | null; jobs_failed: number },
  });
  const gh = useQuery({
    queryKey: ['github-status'],
    queryFn: () => callFunction<{ name: string; installUrl: string; installations: { id: number; account: string | null }[] }>('github-api', { action: 'status' }),
    retry: false,
  });
  const [connecting, setConnecting] = useState(false);

  const connectSlack = async () => {
    setConnecting(true);
    try {
      const { url } = await callFunction<{ url: string }>('slack-api', { action: 'authorize_url' });
      location.href = url;
    } catch (e) {
      toast.error((e as Error).message);
      setConnecting(false);
    }
  };

  const disconnectSlack = async () => {
    if (!confirm('Disconnect Slack? All reminders and posts stop.')) return;
    await callFunction('slack-api', { action: 'disconnect' });
    qc.invalidateQueries({ queryKey: ['integration-status'] });
  };

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <Github className="mt-0.5 size-6" />
          <div className="flex-1">
            <h3 className="font-display text-lg font-bold">GitHub App</h3>
            <p className="text-sm text-muted">Creates issues, syncs comments and statuses, links pull requests.</p>
            {gh.isLoading && <p className="mt-2 text-sm text-muted">Checking…</p>}
            {gh.isError && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400">
                <AlertTriangle className="size-4" /> Not configured: {(gh.error as Error).message}
              </p>
            )}
            {gh.data && (
              <div className="mt-2 space-y-1 text-sm">
                <p className="flex items-center gap-1.5 text-brand-700 dark:text-brand-400"><CheckCircle2 className="size-4" /> {gh.data.name} is configured</p>
                <p className="text-muted">
                  Installed on: {gh.data.installations.length ? gh.data.installations.map((i) => i.account).join(', ') : 'nowhere yet'}
                </p>
              </div>
            )}
          </div>
          {gh.data && <a href={gh.data.installUrl} target="_blank" rel="noreferrer"><Button>Install / manage repos</Button></a>}
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <Hash className="mt-0.5 size-6" />
          <div className="flex-1">
            <h3 className="font-display text-lg font-bold">Slack</h3>
            <p className="text-sm text-muted">Due-date DMs, sprint digests and team activity feeds. Each team chooses its channel and toggles.</p>
            {status.data?.slack ? (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-brand-700 dark:text-brand-400">
                <CheckCircle2 className="size-4" /> Connected to {status.data.slack.team_name} · {fmtDate(status.data.slack.connected_at.slice(0, 10), 'MMM d, yyyy')}
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted">Not connected.</p>
            )}
          </div>
          {status.data?.slack ? (
            <div className="flex gap-2">
              <Button onClick={connectSlack} loading={connecting}>Reconnect</Button>
              <Button variant="ghost" onClick={disconnectSlack}>Disconnect</Button>
            </div>
          ) : (
            <Button variant="primary" onClick={connectSlack} loading={connecting}>Connect Slack</Button>
          )}
        </div>
      </Card>

      {!!status.data?.jobs_failed && (
        <Card className="flex items-center gap-3 border-amber-300 p-4 text-sm">
          <AlertTriangle className="size-5 text-amber-500" />
          {status.data.jobs_failed} sync job{status.data.jobs_failed > 1 ? 's' : ''} failed in the last week (GitHub or Slack). Check the <code>jobs</code> table and the dispatch function logs in Supabase.
        </Card>
      )}
    </div>
  );
}

const KINDS: { value: CalendarEvent['kind']; label: string }[] = [
  { value: 'break', label: '🏖️ Break' },
  { value: 'finals', label: '📚 Finals / exams' },
  { value: 'event', label: '🎉 Club event' },
  { value: 'deadline', label: '⏰ Deadline' },
];

function CalendarAdmin() {
  const { data: events = [] } = useCalendar();
  const db = useDb([['calendar_events']]);
  const [form, setForm] = useState({ title: '', kind: 'break' as CalendarEvent['kind'], starts_on: '', ends_on: '' });

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h3 className="font-display text-lg font-bold">Add a date</h3>
        <p className="mb-3 text-sm text-muted">Shown as shaded bands on every team's timeline so nobody plans a sprint over Thanksgiving.</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_10rem_9rem_9rem_auto]">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Thanksgiving break" />
          <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as CalendarEvent['kind'] })}>
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </Select>
          <Input type="date" value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value, ends_on: form.ends_on || e.target.value })} />
          <Input type="date" value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} />
          <Button
            variant="primary"
            icon={<CalendarPlus className="size-4" />}
            onClick={async () => {
              if (!form.title.trim() || !form.starts_on) return;
              await db.mutateAsync({ op: 'insert', table: 'calendar_events', values: { ...form, ends_on: form.ends_on || form.starts_on } });
              setForm({ title: '', kind: form.kind, starts_on: '', ends_on: '' });
            }}
          >
            Add
          </Button>
        </div>
      </Card>
      <Card className="divide-y divide-line">
        {events.length === 0 && <p className="p-4 text-sm text-muted">No dates yet. Add semester start, breaks, finals and demo day.</p>}
        {events.map((e) => (
          <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span>{KINDS.find((k) => k.value === e.kind)?.label.split(' ')[0]}</span>
            <span className="flex-1 font-medium">{e.title}</span>
            <span className="text-muted">{fmtDate(e.starts_on, 'MMM d, yyyy')}{e.ends_on !== e.starts_on && ` – ${fmtDate(e.ends_on, 'MMM d')}`}</span>
            <button onClick={() => db.mutate({ op: 'delete', table: 'calendar_events', match: { id: e.id } })} className="rounded p-1 text-muted hover:text-red-600" aria-label="Delete">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </Card>
    </div>
  );
}
