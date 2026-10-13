import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useIssues } from '../../lib/queries';
import { useUI } from '../../lib/ui-context';
import { Button, PageLoader, Select } from '../../components/ui';
import { applyFilters, emptyFilters, FilterBar, IssueList } from '../../components/issue/IssueViews';
import { useTeamCtx } from './TeamLayout';

export function IssuesPage() {
  const { team, bundle } = useTeamCtx();
  const ui = useUI();
  const { data: issues = [], isLoading } = useIssues({ teamId: team.id });
  const [filters, setFilters] = useState(emptyFilters);
  const [groupBy, setGroupBy] = useState<'state' | 'assignee' | 'none'>('state');

  if (isLoading || bundle.loading) return <PageLoader />;
  const shown = applyFilters(issues, filters, bundle);

  return (
    <div>
      <div className="px-4 py-3 sm:px-6">
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          bundle={bundle}
          right={
            <>
              <Select value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)} className="h-8 text-[13px]">
                <option value="state">Group by status</option>
                <option value="assignee">Group by assignee</option>
                <option value="none">No grouping</option>
              </Select>
              <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => ui.openCreateIssue({ team_id: team.id })}>
                New issue
              </Button>
            </>
          }
        />
      </div>
      <div className="border-t border-line">
        <IssueList issues={shown} bundle={bundle} groupBy={groupBy} teamId={team.id} emptyText="No issues match these filters." />
      </div>
    </div>
  );
}
