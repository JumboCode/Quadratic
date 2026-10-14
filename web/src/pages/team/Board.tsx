import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useIssues } from '../../lib/queries';
import { useUI } from '../../lib/ui-context';
import { cycleName, isCurrentCycle, todayISO } from '../../lib/utils';
import { Button, Empty, PageLoader, Select } from '../../components/ui';
import { applyFilters, emptyFilters, FilterBar, IssueBoard } from '../../components/issue/IssueViews';
import { useTeamCtx } from './TeamLayout';

export function Board() {
  const { team, bundle } = useTeamCtx();
  const ui = useUI();
  const { data: issues = [], isLoading } = useIssues({ teamId: team.id });
  const [filters, setFilters] = useState(emptyFilters);
  const today = todayISO();
  const current = bundle.cycles.find((c) => isCurrentCycle(c, today));
  const [scope, setScope] = useState<'all' | 'current' | string>('all');

  if (isLoading || bundle.loading) return <PageLoader />;

  let shown = applyFilters(issues, filters, bundle);
  // Hide done work older than two weeks to keep the board readable.
  const cutoff = new Date(Date.now() - 14 * 86_400_000).toISOString();
  shown = shown.filter((i) => !i.completed_at || i.completed_at > cutoff);
  if (scope === 'current') shown = shown.filter((i) => current && i.cycle_id === current.id);
  else if (scope !== 'all') shown = shown.filter((i) => i.cycle_id === scope);

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-3 sm:px-6">
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          bundle={bundle}
          right={
            <>
              <Select value={scope} onChange={(e) => setScope(e.target.value)} className="h-8 text-[13px]">
                <option value="all">All issues</option>
                {current && <option value="current">Current sprint ({cycleName(current)})</option>}
                {bundle.cycles.filter((c) => c.id !== current?.id && !c.completed_at).map((c) => (
                  <option key={c.id} value={c.id}>{cycleName(c)}</option>
                ))}
              </Select>
              <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => ui.openCreateIssue({ team_id: team.id })}>
                New issue
              </Button>
            </>
          }
        />
      </div>
      {issues.length === 0 ? (
        <Empty
          title="A fresh start!"
          action={<Button variant="primary" onClick={() => ui.openCreateIssue({ team_id: team.id })}>Create the first issue</Button>}
        >
          Create issues here and they'll show up on GitHub for your devs. Press <b>C</b> anytime.
        </Empty>
      ) : (
        <div className="min-h-0 flex-1">
          <IssueBoard issues={shown} bundle={bundle} teamId={team.id} />
        </div>
      )}
    </div>
  );
}
