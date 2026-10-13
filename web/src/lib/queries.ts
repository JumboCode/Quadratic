import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase, unwrap } from './supabase';
import type {
  Activity, CalendarEvent, Comment, Cycle, CycleSnapshot, Doc, Invite, Issue, IssueTemplate, Label,
  Milestone, NotificationSettings, Person, Profile, Project, ProjectDependency, ProjectUpdate, PullRequest,
  Repo, Team, TeamMember, WorkflowState,
} from './types';

// ---------------------------------------------------------------------------
// Teams & team configuration
// ---------------------------------------------------------------------------

export const useTeams = () =>
  useQuery({
    queryKey: ['teams'],
    queryFn: async () => unwrap(await supabase.from('teams').select('*').order('name')) as Team[],
  });

export function useTeamByKey(key: string | undefined) {
  const teams = useTeams();
  return { ...teams, data: teams.data?.find((t) => t.key === key?.toUpperCase()) };
}

const teamScoped = <T,>(table: string, order: string, teamId: string | undefined, select = '*') =>
  ({
    queryKey: [table, teamId],
    enabled: !!teamId,
    queryFn: async () => unwrap(await supabase.from(table).select(select).eq('team_id', teamId!).order(order)) as T[],
  });

export const useStates = (teamId?: string) => useQuery(teamScoped<WorkflowState>('workflow_states', 'position', teamId));
export const useLabels = (teamId?: string) => useQuery(teamScoped<Label>('labels', 'name', teamId));
export const usePeople = (teamId?: string) => useQuery(teamScoped<Person>('people', 'name', teamId));
export const useRepos = (teamId?: string) => useQuery(teamScoped<Repo>('repos', 'full_name', teamId));
export const useTemplates = (teamId?: string) => useQuery(teamScoped<IssueTemplate>('issue_templates', 'name', teamId));
export const useCycles = (teamId?: string) => useQuery(teamScoped<Cycle>('cycles', 'starts_on', teamId));
export const useMembers = (teamId?: string) =>
  useQuery(teamScoped<TeamMember>('team_members', 'role', teamId, '*, profile:profiles(*)'));
export const useInvites = (teamId?: string | null) =>
  useQuery({
    queryKey: ['invites', teamId ?? 'admin'],
    queryFn: async () => {
      let q = supabase.from('invites').select('*').is('accepted_at', null).order('created_at');
      q = teamId ? q.eq('team_id', teamId) : q.is('team_id', null);
      return unwrap(await q) as Invite[];
    },
  });

export const useNotificationSettings = (teamId?: string) =>
  useQuery({
    queryKey: ['notification_settings', teamId],
    enabled: !!teamId,
    queryFn: async () =>
      unwrap(await supabase.from('notification_settings').select('*').eq('team_id', teamId!).single()) as NotificationSettings,
  });

export const useProfiles = () =>
  useQuery({
    queryKey: ['profiles'],
    queryFn: async () => unwrap(await supabase.from('profiles').select('*').order('name')) as Profile[],
    staleTime: 5 * 60_000,
  });

export const useCalendar = () =>
  useQuery({
    queryKey: ['calendar_events'],
    queryFn: async () => unwrap(await supabase.from('calendar_events').select('*').order('starts_on')) as CalendarEvent[],
  });

/** All workflow states the user can see, keyed by id (for cross-team views). */
export const useAllStates = () =>
  useQuery({
    queryKey: ['workflow_states', 'all'],
    queryFn: async () => unwrap(await supabase.from('workflow_states').select('*').order('position')) as WorkflowState[],
  });

export const useAllPeople = () =>
  useQuery({
    queryKey: ['people', 'all'],
    queryFn: async () => unwrap(await supabase.from('people').select('*').order('name')) as Person[],
  });

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

export interface IssueFilter {
  teamId?: string;
  cycleId?: string;
  projectId?: string;
  projectIds?: string[];
  ids?: string[];
  milestoneId?: string;
  parentId?: string;
  assigneeIds?: string[];
  creatorId?: string;
  dueBefore?: string;
}

const ISSUE_SELECT = '*, issue_labels(label_id)';

export const useIssues = (f: IssueFilter, enabled = true) =>
  useQuery({
    queryKey: ['issues', f],
    enabled,
    queryFn: async () => {
      let q = supabase.from('issues').select(ISSUE_SELECT);
      if (f.teamId) q = q.eq('team_id', f.teamId);
      if (f.cycleId) q = q.eq('cycle_id', f.cycleId);
      if (f.projectId) q = q.eq('project_id', f.projectId);
      if (f.projectIds) q = q.in('project_id', f.projectIds);
      if (f.ids) q = q.in('id', f.ids);
      if (f.milestoneId) q = q.eq('milestone_id', f.milestoneId);
      if (f.parentId) q = q.eq('parent_id', f.parentId);
      if (f.creatorId && f.assigneeIds?.length) {
        q = q.or(`creator_id.eq.${f.creatorId},assignee_id.in.(${f.assigneeIds.join(',')})`);
      } else if (f.creatorId) q = q.eq('creator_id', f.creatorId);
      else if (f.assigneeIds) q = q.in('assignee_id', f.assigneeIds);
      if (f.dueBefore) q = q.lte('due_date', f.dueBefore);
      return unwrap(await q.order('sort_order', { ascending: false }).limit(2000)) as Issue[];
    },
  });

export const useIssue = (identifier?: string) =>
  useQuery({
    queryKey: ['issue', identifier],
    enabled: !!identifier,
    queryFn: async () =>
      unwrap(await supabase.from('issues').select(ISSUE_SELECT).eq('identifier', identifier!.toUpperCase()).maybeSingle()) as Issue | null,
  });

export function useSearchIssues(term: string) {
  return useQuery({
    queryKey: ['issue-search', term],
    enabled: term.trim().length > 1,
    queryFn: async () => {
      const t = term.trim().replace(/[%,()]/g, ' ');
      return unwrap(
        await supabase
          .from('issues')
          .select('id, identifier, title, team_id, state_id')
          .or(`title.ilike.%${t}%,identifier.ilike.%${t}%`)
          .order('updated_at', { ascending: false })
          .limit(20),
      ) as Pick<Issue, 'id' | 'identifier' | 'title' | 'team_id' | 'state_id'>[];
    },
  });
}

/** Optimistically patch an issue everywhere it's cached, then persist. */
export function useUpdateIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Issue> }) =>
      unwrap(await supabase.from('issues').update(patch).eq('id', id).select(ISSUE_SELECT).single()) as Issue,
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ['issues'] });
      const snapshots: [QueryKey, unknown][] = [];
      for (const [key, data] of qc.getQueriesData<Issue[]>({ queryKey: ['issues'] })) {
        if (!data) continue;
        snapshots.push([key, data]);
        qc.setQueryData(key, data.map((i) => (i.id === id ? { ...i, ...patch } : i)));
      }
      for (const [key, data] of qc.getQueriesData<Issue | null>({ queryKey: ['issue'] })) {
        if (data?.id !== id) continue;
        snapshots.push([key, data]);
        qc.setQueryData(key, { ...data, ...patch });
      }
      return { snapshots };
    },
    onError: (e, _v, ctx) => {
      ctx?.snapshots.forEach(([k, d]) => qc.setQueryData(k, d));
      toast.error(`Couldn't save: ${e.message}`);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['issues'] });
      qc.invalidateQueries({ queryKey: ['issue'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function useCreateIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ issue, labelIds }: { issue: Partial<Issue>; labelIds: string[] }) => {
      const created = unwrap(await supabase.from('issues').insert(issue).select('*').single()) as Issue;
      if (labelIds.length) {
        unwrap(await supabase.from('issue_labels').insert(labelIds.map((label_id) => ({ issue_id: created.id, label_id }))));
      }
      return created;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['issues'] }),
    onError: (e) => toast.error(`Couldn't create issue: ${e.message}`),
  });
}

export function useSetIssueLabels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ issueId, add, remove }: { issueId: string; add: string[]; remove: string[] }) => {
      if (remove.length) unwrap(await supabase.from('issue_labels').delete().eq('issue_id', issueId).in('label_id', remove));
      if (add.length) unwrap(await supabase.from('issue_labels').insert(add.map((label_id) => ({ issue_id: issueId, label_id }))));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['issues'] });
      qc.invalidateQueries({ queryKey: ['issue'] });
    },
  });
}

/** Live board updates when GitHub (or a teammate) changes something. */
export function useIssuesRealtime(teamId?: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!teamId) return;
    const channel = supabase
      .channel(`issues-${teamId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'issues', filter: `team_id=eq.${teamId}` }, () => {
        qc.invalidateQueries({ queryKey: ['issues'] });
        qc.invalidateQueries({ queryKey: ['issue'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [teamId, qc]);
}

export const useComments = (issueId?: string) =>
  useQuery({
    queryKey: ['comments', issueId],
    enabled: !!issueId,
    queryFn: async () =>
      unwrap(await supabase.from('comments').select('*').eq('issue_id', issueId!).order('created_at')) as Comment[],
  });

export const useIssuePullRequests = (issueId?: string) =>
  useQuery({
    queryKey: ['issue_prs', issueId],
    enabled: !!issueId,
    queryFn: async () => {
      const rows = unwrap(
        await supabase.from('issue_pull_requests').select('pull_request:pull_requests(*)').eq('issue_id', issueId!),
      ) as unknown as { pull_request: PullRequest }[];
      return rows.map((r) => r.pull_request);
    },
  });

export const useActivity = (f: { issueId?: string; teamIds?: string[]; limit?: number }) =>
  useQuery({
    queryKey: ['activity', f],
    queryFn: async () => {
      let q = supabase.from('activity').select('*');
      if (f.issueId) q = q.eq('issue_id', f.issueId);
      if (f.teamIds) q = q.in('team_id', f.teamIds);
      return unwrap(await q.order('created_at', { ascending: false }).limit(f.limit ?? 50)) as Activity[];
    },
  });

// ---------------------------------------------------------------------------
// Cycles & projects
// ---------------------------------------------------------------------------

export const useSnapshots = (cycleIds: string[]) =>
  useQuery({
    queryKey: ['cycle_snapshots', cycleIds],
    enabled: cycleIds.length > 0,
    queryFn: async () =>
      unwrap(await supabase.from('cycle_snapshots').select('*').in('cycle_id', cycleIds).order('day')) as CycleSnapshot[],
  });

export const useProjects = (teamId?: string) =>
  useQuery({
    queryKey: ['projects', teamId ?? 'all'],
    queryFn: async () => {
      const select = teamId ? '*, project_teams!inner(team_id)' : '*, project_teams(team_id)';
      let q = supabase.from('projects').select(select);
      if (teamId) q = q.eq('project_teams.team_id', teamId);
      return unwrap(await q.order('target_date', { nullsFirst: false })) as unknown as Project[];
    },
  });

export const useProject = (id?: string) =>
  useQuery({
    queryKey: ['project', id],
    enabled: !!id,
    queryFn: async () =>
      unwrap(await supabase.from('projects').select('*, project_teams(team_id)').eq('id', id!).maybeSingle()) as Project | null,
  });

export const useMilestones = (projectIds: string[] | undefined) =>
  useQuery({
    queryKey: ['milestones', projectIds],
    enabled: !!projectIds?.length,
    queryFn: async () =>
      unwrap(await supabase.from('milestones').select('*').in('project_id', projectIds!).order('position').order('target_date')) as Milestone[],
  });

export const useDependencies = () =>
  useQuery({
    queryKey: ['project_dependencies'],
    queryFn: async () => unwrap(await supabase.from('project_dependencies').select('*')) as ProjectDependency[],
  });

export const useProjectUpdates = (projectId?: string) =>
  useQuery({
    queryKey: ['project_updates', projectId],
    enabled: !!projectId,
    queryFn: async () =>
      unwrap(
        await supabase.from('project_updates').select('*').eq('project_id', projectId!).order('created_at', { ascending: false }),
      ) as ProjectUpdate[],
  });

export const useDocs = (f: { teamId?: string; projectId?: string }) =>
  useQuery({
    queryKey: ['documents', f],
    queryFn: async () => {
      let q = supabase.from('documents').select('*');
      if (f.teamId) q = q.eq('team_id', f.teamId);
      if (f.projectId) q = q.eq('project_id', f.projectId);
      return unwrap(await q.order('updated_at', { ascending: false })) as Doc[];
    },
  });

export const useDoc = (id?: string) =>
  useQuery({
    queryKey: ['document', id],
    enabled: !!id,
    queryFn: async () => unwrap(await supabase.from('documents').select('*').eq('id', id!).maybeSingle()) as Doc | null,
  });

// ---------------------------------------------------------------------------
// Generic table mutations for settings-style screens
// ---------------------------------------------------------------------------

type Op =
  | { op: 'insert'; table: string; values: Record<string, unknown> | Record<string, unknown>[] }
  | { op: 'update'; table: string; match: Record<string, unknown>; values: Record<string, unknown> }
  | { op: 'delete'; table: string; match: Record<string, unknown> }
  | { op: 'upsert'; table: string; values: Record<string, unknown> | Record<string, unknown>[] };

/**
 * Runs an insert/update/delete and invalidates the given query keys.
 * Returns the affected rows (for insert/upsert).
 */
export function useDb(invalidate: QueryKey[], successMessage?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (o: Op) => {
      const t = supabase.from(o.table);
      switch (o.op) {
        case 'insert':
          return unwrap(await t.insert(o.values).select());
        case 'upsert':
          return unwrap(await t.upsert(o.values).select());
        case 'update':
          return unwrap(await t.update(o.values).match(o.match).select());
        case 'delete':
          return unwrap(await t.delete().match(o.match).select());
      }
    },
    onSuccess: () => {
      invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      if (successMessage) toast.success(successMessage);
    },
    onError: (e) => toast.error(e.message),
  });
}
