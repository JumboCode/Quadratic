import { useMemo } from 'react';
import { useCycles, useLabels, usePeople, useProjects, useStates } from './queries';

/** Everything needed to render issue properties for one team. */
export function useTeamBundle(teamId: string | undefined) {
  const states = useStates(teamId);
  const labels = useLabels(teamId);
  const people = usePeople(teamId);
  const cycles = useCycles(teamId);
  const projects = useProjects(teamId);

  return useMemo(
    () => ({
      loading: states.isLoading || labels.isLoading || people.isLoading,
      states: states.data ?? [],
      labels: labels.data ?? [],
      people: people.data ?? [],
      cycles: cycles.data ?? [],
      projects: projects.data ?? [],
      stateById: new Map((states.data ?? []).map((s) => [s.id, s])),
      labelById: new Map((labels.data ?? []).map((l) => [l.id, l])),
      personById: new Map((people.data ?? []).map((p) => [p.id, p])),
      cycleById: new Map((cycles.data ?? []).map((c) => [c.id, c])),
      projectById: new Map((projects.data ?? []).map((p) => [p.id, p])),
    }),
    [states.data, labels.data, people.data, cycles.data, projects.data, states.isLoading, labels.isLoading, people.isLoading],
  );
}

export type TeamBundle = ReturnType<typeof useTeamBundle>;
