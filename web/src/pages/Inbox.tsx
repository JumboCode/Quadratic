import { Link } from 'react-router-dom';
import { Check, Github, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useActivity, useIssues, useProfiles, useTeams, useUpdateIssue } from '../lib/queries';
import { useTeamBundle } from '../lib/team-bundle';
import type { Activity, Team } from '../lib/types';
import { ago, PRIORITIES } from '../lib/utils';
import { Button, Card, Empty } from '../components/ui';
import { useOpenIssue } from '../components/issue/IssueViews';
import { IssuePanel } from '../components/issue/IssueDetail';

export function Inbox() {
  const { roles, profile } = useAuth();
  const { data: teams = [] } = useTeams();
  const { openId, close } = useOpenIssue();
  const myTeams = teams.filter((t) => !t.archived && (roles[t.id] || profile?.is_admin));
  const { data: activity = [] } = useActivity({ teamIds: myTeams.map((t) => t.id), limit: 60 });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Inbox</h1>
        <p className="text-sm text-muted">Issues opened directly on GitHub wait here for triage, plus recent activity across your teams.</p>
      </div>
      {myTeams.map((t) => <Triage key={t.id} team={t} />)}
      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 py-3 font-semibold">Recent activity</div>
        <ActivityFeed activity={activity} teams={myTeams} />
      </Card>
      <IssuePanel identifier={openId} onClose={close} />
    </div>
  );
}

function Triage({ team }: { team: Team }) {
  const bundle = useTeamBundle(team.id);
  const { data: issues = [] } = useIssues({ teamId: team.id });
  const update = useUpdateIssue();
  const { open } = useOpenIssue();
  const triageIds = new Set(bundle.states.filter((s) => s.category === 'triage').map((s) => s.id));
  const pending = issues.filter((i) => triageIds.has(i.state_id));
  const accept = bundle.states.find((s) => s.category === 'backlog') ?? bundle.states.find((s) => s.category === 'unstarted');
  const decline = bundle.states.find((s) => s.category === 'canceled');
  if (!pending.length) return null;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3 font-semibold">
        {team.emoji} {team.name} <span className="rounded-full bg-amber-500/15 px-2 text-xs text-amber-700 dark:text-amber-400">{pending.length} to triage</span>
      </div>
      {pending.map((i) => (
        <div key={i.id} className="flex items-center gap-3 border-b border-line/70 px-4 py-2.5 text-sm last:border-0">
          <Github className="size-4 shrink-0 text-muted" />
          <button onClick={() => open(i.identifier)} className="min-w-0 flex-1 text-left">
            <span className="mr-2 font-mono text-xs text-muted">{i.identifier}</span>
            <span className="font-medium">{i.title}</span>
            <span className="ml-2 text-xs text-muted">{ago(i.created_at)}</span>
          </button>
          {i.priority > 0 && <span className="text-xs text-muted">{PRIORITIES[i.priority].label}</span>}
          {accept && (
            <Button size="sm" onClick={() => update.mutate({ id: i.id, patch: { state_id: accept.id } })} icon={<Check className="size-3.5" />}>
              Accept
            </Button>
          )}
          {decline && (
            <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: i.id, patch: { state_id: decline.id } })} icon={<X className="size-3.5" />}>
              Decline
            </Button>
          )}
        </div>
      ))}
    </Card>
  );
}

function ActivityFeed({ activity, teams }: { activity: Activity[]; teams: Team[] }) {
  const { data: profiles = [] } = useProfiles();
  const ids = [...new Set(activity.map((a) => a.issue_id).filter(Boolean) as string[])];
  const { data: issues = [] } = useIssues({ ids }, ids.length > 0);
  const issueById = new Map(issues.map((i) => [i.id, i]));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const nameOf = (a: Activity) =>
    a.actor_id ? profiles.find((p) => p.id === a.actor_id)?.name ?? 'Someone' : a.actor_github_login ? `@${a.actor_github_login}` : 'GitHub';

  const verb = (a: Activity) => {
    const d = a.data as Record<string, string>;
    switch (a.verb) {
      case 'created': return 'created';
      case 'state_changed': return `moved to ${d.to}`;
      case 'assigned': return d.person ? `assigned ${d.person} to` : 'unassigned';
      case 'commented': return 'commented on';
      case 'pull_request': return `${d.action === 'merged' ? 'merged' : String(d.action).replace(/_/g, ' ')} a PR for`;
      case 'commit': return 'pushed a commit for';
      case 'priority_changed': return 'reprioritized';
      case 'cycle_changed': return 'changed the sprint of';
      default: return a.verb;
    }
  };

  if (!activity.length) return <Empty title="Quiet in here">Activity shows up as your teams plan and ship.</Empty>;

  return (
    <div className="divide-y divide-line/70">
      {activity.map((a) => {
        const issue = a.issue_id ? issueById.get(a.issue_id) : null;
        const team = a.team_id ? teamById.get(a.team_id) : null;
        return (
          <div key={a.id} className="flex items-center gap-3 px-4 py-2 text-sm">
            <span>{team?.emoji}</span>
            <span className="min-w-0 flex-1 truncate">
              <b className="font-medium">{nameOf(a)}</b> <span className="text-muted">{verb(a)}</span>{' '}
              {issue && (
                <Link to={`/issue/${issue.identifier}`} className="hover:underline">
                  <span className="font-mono text-xs text-muted">{issue.identifier}</span> {issue.title}
                </Link>
              )}
            </span>
            <span className="shrink-0 text-xs text-muted">{ago(a.created_at)}</span>
          </div>
        );
      })}
    </div>
  );
}
