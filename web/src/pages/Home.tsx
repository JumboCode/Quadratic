import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { addDays, format } from 'date-fns';
import { CalendarDays, Plus, RefreshCcw } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useAllPeople, useAllStates, useCalendar, useIssues, useMilestones, useProjects, useTeams } from '../lib/queries';
import { useTeamBundle } from '../lib/team-bundle';
import type { Issue, Team } from '../lib/types';
import { useUI } from '../lib/ui-context';
import { cycleName, dueLabel, fmtDate, isClosed, todayISO } from '../lib/utils';
import { Button, Card, Empty, Progress } from '../components/ui';
import { Mascot } from '../components/Mascot';
import { IssueList, useOpenIssue } from '../components/issue/IssueViews';
import { IssuePanel } from '../components/issue/IssueDetail';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function Home() {
  const { profile, roles } = useAuth();
  const ui = useUI();
  const { data: teams = [] } = useTeams();
  const { data: people = [] } = useAllPeople();
  const { openId, close } = useOpenIssue();
  const myTeams = teams.filter((t) => !t.archived && (roles[t.id] || (profile?.is_admin && Object.keys(roles).length === 0)));
  // Leads who also code show up in "people"; match by link or GitHub username.
  const myPersonIds = people
    .filter((p) => p.profile_id === profile?.id || (p.github_login && p.github_login.toLowerCase() === profile?.github_login?.toLowerCase()))
    .map((p) => p.id);

  const { data: mine = [] } = useIssues({ creatorId: profile?.id, assigneeIds: myPersonIds }, !!profile);
  const { data: states = [] } = useAllStates();
  const stateById = new Map(states.map((s) => [s.id, s]));
  const openMine = mine.filter((i) => !isClosed(stateById.get(i.state_id)?.category));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4 rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 p-6 text-white shadow-lg shadow-brand-700/20">
        <Mascot className="hidden size-20 shrink-0 drop-shadow sm:block" />
        <div className="flex-1">
          <h1 className="font-display text-2xl font-extrabold sm:text-3xl">{greeting()}, {profile?.name?.split(' ')[0] ?? 'friend'}! 👋</h1>
          <p className="mt-1 text-brand-50/90">
            {openMine.length ? `You have ${openMine.length} open issue${openMine.length > 1 ? 's' : ''} you created or own.` : "You're all caught up. Time to plan something great."}
          </p>
        </div>
        <Button className="border-white/30 bg-white/15 text-white hover:bg-white/25" icon={<Plus className="size-4" />} onClick={() => ui.openCreateIssue()}>
          New issue
        </Button>
      </motion.div>

      {myTeams.length === 0 ? (
        <Empty title="No teams yet" action={profile?.is_admin ? <Link to="/admin"><Button variant="primary">Create a team</Button></Link> : undefined}>
          {profile?.is_admin ? 'As an admin, start by creating this year’s teams and inviting their leads.' : 'Ask an admin to add you to a team.'}
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {myTeams.map((t, i) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <TeamCard team={t} />
            </motion.div>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="border-b border-line px-4 py-3 font-semibold">My issues</div>
          <MyIssues issues={openMine} />
        </Card>
        <Upcoming />
      </div>
      <IssuePanel identifier={openId} onClose={close} />
    </div>
  );
}

/** Groups my issues by team so each list gets the right statuses/people. */
function MyIssues({ issues }: { issues: Issue[] }) {
  const teamIds = [...new Set(issues.map((i) => i.team_id))];
  if (!issues.length) return <div className="p-8 text-center text-sm text-muted">Nothing here. Issues you create show up in this list.</div>;
  return (
    <>
      {teamIds.map((id) => <TeamIssues key={id} teamId={id} issues={issues.filter((i) => i.team_id === id)} />)}
    </>
  );
}

function TeamIssues({ teamId, issues }: { teamId: string; issues: Issue[] }) {
  const bundle = useTeamBundle(teamId);
  return <IssueList issues={issues} bundle={bundle} groupBy="none" />;
}

function TeamCard({ team }: { team: Team }) {
  const bundle = useTeamBundle(team.id);
  const { data: issues = [] } = useIssues({ teamId: team.id });
  const today = todayISO();
  const cycle = bundle.cycles.find((c) => c.starts_on <= today && today <= c.ends_on);
  const inCycle = cycle ? issues.filter((i) => i.cycle_id === cycle.id && bundle.stateById.get(i.state_id)?.category !== 'canceled') : [];
  const done = inCycle.filter((i) => bundle.stateById.get(i.state_id)?.category === 'completed').length;
  const pct = inCycle.length ? Math.round((done / inCycle.length) * 100) : 0;
  const open = issues.filter((i) => !isClosed(bundle.stateById.get(i.state_id)?.category));
  const overdue = open.filter((i) => i.due_date && dueLabel(i.due_date).tone === 'late').length;
  const triage = issues.filter((i) => bundle.stateById.get(i.state_id)?.category === 'triage').length;

  return (
    <Link to={`/team/${team.key}/board`}>
      <Card className="group h-full p-5 transition hover:-translate-y-1 hover:border-brand-300 hover:shadow-lg">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl text-2xl transition group-hover:rotate-6 group-hover:scale-110" style={{ background: `${team.color}22` }}>
            {team.emoji}
          </span>
          <div>
            <div className="font-display text-lg font-bold">{team.name}</div>
            <div className="text-xs text-muted">{open.length} open · {triage > 0 ? `${triage} to triage · ` : ''}{overdue > 0 ? <span className="text-red-600">{overdue} overdue</span> : 'nothing overdue'}</div>
          </div>
        </div>
        <div className="mt-4">
          {cycle ? (
            <>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted">
                <RefreshCcw className="size-3" /> {cycleName(cycle)} · ends {fmtDate(cycle.ends_on)}
                <span className="ml-auto tabular-nums">{done}/{inCycle.length}</span>
              </div>
              <Progress value={pct} color={team.color} />
            </>
          ) : (
            <div className="text-xs text-muted">No active sprint</div>
          )}
        </div>
      </Card>
    </Link>
  );
}

function Upcoming() {
  const { data: events = [] } = useCalendar();
  const { data: projects = [] } = useProjects();
  const { data: milestones = [] } = useMilestones(projects.map((p) => p.id));
  const today = todayISO();
  const horizon = format(addDays(new Date(), 45), 'yyyy-MM-dd');
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const items = [
    ...events.filter((e) => e.ends_on >= today && e.starts_on <= horizon).map((e) => ({ date: e.starts_on, label: e.title, sub: e.kind, to: null as string | null })),
    ...milestones
      .filter((m) => m.target_date && m.target_date >= today && m.target_date <= horizon)
      .map((m) => ({ date: m.target_date!, label: `◆ ${m.name}`, sub: projectById.get(m.project_id)?.name ?? '', to: `/projects/${m.project_id}` })),
    ...projects
      .filter((p) => p.target_date && p.target_date >= today && p.target_date <= horizon && p.status !== 'completed')
      .map((p) => ({ date: p.target_date!, label: `${p.emoji} ${p.name} due`, sub: 'project target', to: `/projects/${p.id}` })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2 font-semibold"><CalendarDays className="size-4 text-brand-500" /> Coming up</div>
      {items.length === 0 && <p className="text-sm text-muted">Nothing in the next 45 days.</p>}
      <div className="space-y-2">
        {items.slice(0, 10).map((it, i) => {
          const body = (
            <div className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-2">
              <div className="w-12 shrink-0 rounded-lg bg-surface-2 py-1 text-center">
                <div className="text-[10px] uppercase text-muted">{fmtDate(it.date, 'MMM')}</div>
                <div className="font-display font-bold leading-none">{fmtDate(it.date, 'd')}</div>
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{it.label}</div>
                <div className="truncate text-xs text-muted">{it.sub}</div>
              </div>
            </div>
          );
          return it.to ? <Link key={i} to={it.to}>{body}</Link> : <div key={i}>{body}</div>;
        })}
      </div>
    </Card>
  );
}
