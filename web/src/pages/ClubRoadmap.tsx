import { useMemo, useState } from 'react';
import { useProjects, useTeams } from '../lib/queries';
import { cn } from '../lib/utils';
import { RoadmapView } from '../components/RoadmapView';

export function ClubRoadmap() {
  const { data: projects = [], isLoading } = useProjects();
  const { data: teams = [] } = useTeams();
  const [selected, setSelected] = useState<string[]>([]);
  const active = teams.filter((t) => !t.archived);
  const shown = useMemo(
    () => (selected.length ? projects.filter((p) => p.project_teams?.some((pt) => selected.includes(pt.team_id))) : projects),
    [projects, selected],
  );

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Club roadmap</h1>
        <p className="text-sm text-muted">Every project across JumboCode that you can see, on one timeline.</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {active.map((t) => {
          const on = selected.includes(t.id);
          return (
            <button
              key={t.id}
              onClick={() => setSelected(on ? selected.filter((x) => x !== t.id) : [...selected, t.id])}
              className={cn('rounded-full border px-3 py-1 text-sm transition', on ? 'border-brand-400 bg-brand-500/10' : 'border-line text-muted hover:text-ink')}
            >
              {t.emoji} {t.name}
            </button>
          );
        })}
      </div>
      <RoadmapView projects={shown} loading={isLoading} />
    </div>
  );
}
