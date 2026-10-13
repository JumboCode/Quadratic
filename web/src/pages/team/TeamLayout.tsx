import { NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom';
import { Archive } from 'lucide-react';
import { useIssuesRealtime, useTeamByKey } from '../../lib/queries';
import { useTeamBundle, type TeamBundle } from '../../lib/team-bundle';
import type { Team } from '../../lib/types';
import { cn } from '../../lib/utils';
import { Empty, PageLoader } from '../../components/ui';
import { IssuePanel } from '../../components/issue/IssueDetail';
import { useOpenIssue } from '../../components/issue/IssueViews';

interface TeamCtx {
  team: Team;
  bundle: TeamBundle;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTeamCtx = () => useOutletContext<TeamCtx>();

const TABS = [
  ['board', 'Board'],
  ['issues', 'Issues'],
  ['cycles', 'Sprints'],
  ['projects', 'Projects'],
  ['roadmap', 'Timeline'],
  ['docs', 'Docs'],
  ['settings', 'Settings'],
] as const;

export function TeamLayout() {
  const { teamKey } = useParams();
  const { data: team, isLoading } = useTeamByKey(teamKey);
  const bundle = useTeamBundle(team?.id);
  const { openId, close } = useOpenIssue();
  useIssuesRealtime(team?.id);

  if (isLoading) return <PageLoader />;
  if (!team) return <Empty title="Team not found">There's no team with the key “{teamKey}”, or you're not a member.</Empty>;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line bg-surface/50 px-4 pt-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl text-lg" style={{ background: `${team.color}22` }}>
            {team.emoji}
          </span>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 font-display text-xl font-bold leading-tight">
              {team.name}
              {team.archived && (
                <span className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">
                  <Archive className="size-3" /> Archived
                </span>
              )}
            </h1>
            <div className="text-xs text-muted">
              {team.key}
              {team.academic_year && ` · ${team.academic_year}`}
            </div>
          </div>
        </div>
        <nav className="-mb-px mt-3 flex gap-1 overflow-x-auto">
          {TABS.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'whitespace-nowrap border-b-2 px-3 pb-2 pt-1 text-sm font-medium transition',
                  isActive ? 'border-brand-500 text-ink' : 'border-transparent text-muted hover:text-ink',
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <div className="min-h-0 flex-1">
        <Outlet context={{ team, bundle } satisfies TeamCtx} />
      </div>
      <IssuePanel identifier={openId} onClose={close} />
    </div>
  );
}
