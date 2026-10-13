import { useMemo } from 'react';
import { useAllStates, useCalendar, useDependencies, useIssues, useMilestones, useTeams } from '../lib/queries';
import { projectStats } from '../lib/projects';
import type { Cycle, Project } from '../lib/types';
import { PageLoader } from './ui';
import { Timeline } from './Timeline';

/** Loads everything the Timeline needs for a set of projects. */
export function RoadmapView({ projects, loading, cycles }: { projects: Project[]; loading?: boolean; cycles?: Cycle[] }) {
  const ids = projects.map((p) => p.id);
  const { data: issues = [] } = useIssues({ projectIds: ids }, ids.length > 0);
  const { data: states = [] } = useAllStates();
  const { data: milestones = [] } = useMilestones(ids);
  const { data: deps = [] } = useDependencies();
  const { data: events = [] } = useCalendar();
  const { data: teams = [] } = useTeams();

  const progress = useMemo(() => {
    const stateById = new Map(states.map((s) => [s.id, s]));
    return new Map(projects.map((p) => [p.id, projectStats(issues.filter((i) => i.project_id === p.id), stateById).pct]));
  }, [projects, issues, states]);

  const visible = useMemo(() => projects.filter((p) => p.status !== 'canceled'), [projects]);

  if (loading) return <PageLoader />;
  return (
    <Timeline
      projects={visible}
      progress={progress}
      milestones={milestones}
      dependencies={deps}
      events={events}
      cycles={cycles}
      teams={teams}
    />
  );
}
