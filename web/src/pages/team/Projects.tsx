import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useAllStates, useIssues, useProjects } from '../../lib/queries';
import { projectStats } from '../../lib/projects';
import { Button, Empty, PageLoader } from '../../components/ui';
import { CreateProjectModal, ProjectCard } from '../../components/ProjectBits';
import { useTeamCtx } from './TeamLayout';

export function Projects() {
  const { team } = useTeamCtx();
  const { data: projects = [], isLoading } = useProjects(team.id);
  const { data: issues = [] } = useIssues({ projectIds: projects.map((p) => p.id) }, projects.length > 0);
  const { data: states = [] } = useAllStates();
  const stateById = new Map(states.map((s) => [s.id, s]));
  const [creating, setCreating] = useState(false);

  if (isLoading) return <PageLoader />;

  const groups = [
    { title: 'Active', list: projects.filter((p) => ['in_progress', 'paused'].includes(p.status)) },
    { title: 'Planned', list: projects.filter((p) => p.status === 'planned') },
    { title: 'Done', list: projects.filter((p) => ['completed', 'canceled'].includes(p.status)) },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">Projects</h2>
          <p className="text-sm text-muted">Bigger goals made of issues, with milestones, docs and health updates.</p>
        </div>
        <Button variant="primary" className="ml-auto" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
          New project
        </Button>
      </div>
      {projects.length === 0 ? (
        <Empty title="No projects yet" action={<Button variant="primary" onClick={() => setCreating(true)}>Start a project</Button>}>
          Group related issues into a project (like “MVP” or “Client onboarding”) to track progress toward a date.
        </Empty>
      ) : (
        groups.map(
          (g) =>
            g.list.length > 0 && (
              <section key={g.title}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{g.title}</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {g.list.map((p) => (
                    <ProjectCard key={p.id} project={p} stats={projectStats(issues.filter((i) => i.project_id === p.id), stateById)} />
                  ))}
                </div>
              </section>
            ),
        )
      )}
      <CreateProjectModal open={creating} onClose={() => setCreating(false)} defaultTeamId={team.id} />
    </div>
  );
}
