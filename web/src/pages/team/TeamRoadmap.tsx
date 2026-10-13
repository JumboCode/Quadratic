import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useProjects } from '../../lib/queries';
import { Button } from '../../components/ui';
import { RoadmapView } from '../../components/RoadmapView';
import { CreateProjectModal } from '../../components/ProjectBits';
import { useTeamCtx } from './TeamLayout';

export function TeamRoadmap() {
  const { team, bundle } = useTeamCtx();
  const { data: projects = [], isLoading } = useProjects(team.id);
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">Timeline</h2>
          <p className="text-sm text-muted">Your team's year at a glance: sprints, projects, milestones and the academic calendar.</p>
        </div>
        <Button variant="primary" className="ml-auto" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New project</Button>
      </div>
      <RoadmapView projects={projects} loading={isLoading} cycles={bundle.cycles} />
      <CreateProjectModal open={creating} onClose={() => setCreating(false)} defaultTeamId={team.id} />
    </div>
  );
}
