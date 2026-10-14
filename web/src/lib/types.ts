// Row types mirroring supabase/migrations. Kept by hand; regenerate with `supabase gen types` if preferred.

export type TeamRole = 'pm' | 'tech_lead' | 'designer';
export type StateCategory = 'triage' | 'backlog' | 'unstarted' | 'started' | 'review' | 'completed' | 'canceled';
export type ProjectStatus = 'planned' | 'in_progress' | 'paused' | 'completed' | 'canceled';
export type ProjectHealth = 'on_track' | 'at_risk' | 'off_track';
export type CalendarKind = 'break' | 'finals' | 'event' | 'deadline';

export interface Profile {
  id: string;
  github_login: string | null;
  name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
}

export interface Team {
  id: string;
  name: string;
  key: string;
  description: string | null;
  color: string;
  emoji: string;
  academic_year: string | null;
  archived: boolean;
  slack_channel_id: string | null;
  slack_channel_name: string | null;
  pr_opened_state_id: string | null;
  pr_review_state_id: string | null;
  pr_merged_state_id: string | null;
}

export interface TeamMember {
  team_id: string;
  user_id: string;
  role: TeamRole;
  profile?: Profile;
}

export interface Invite {
  id: string;
  team_id: string | null;
  github_login: string;
  role: TeamRole | null;
  make_admin: boolean;
  accepted_at: string | null;
  created_at: string;
}

export interface Person {
  id: string;
  team_id: string;
  name: string;
  github_login: string | null;
  email: string | null;
  slack_user_id: string | null;
  profile_id: string | null;
  active: boolean;
}

export interface Repo {
  id: string;
  team_id: string;
  github_repo_id: number;
  installation_id: number;
  full_name: string;
  default_branch: string;
  is_default: boolean;
}

export interface WorkflowState {
  id: string;
  team_id: string;
  name: string;
  category: StateCategory;
  color: string;
  position: number;
}

export interface Label {
  id: string;
  team_id: string;
  name: string;
  color: string;
}

export interface Cycle {
  id: string;
  team_id: string;
  number: number;
  name: string | null;
  goal: string | null;
  starts_on: string;
  ends_on: string;
  completed_at: string | null;
  carried_over_count: number | null;
  carried_over_points: number | null;
}

export interface CycleSnapshot {
  cycle_id: string;
  day: string;
  scope_count: number;
  completed_count: number;
  scope_points: number;
  completed_points: number;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  emoji: string;
  color: string;
  status: ProjectStatus;
  health: ProjectHealth | null;
  lead_id: string | null;
  start_date: string | null;
  target_date: string | null;
  created_by: string | null;
  created_at: string;
  project_teams?: { team_id: string }[];
}

export interface Milestone {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  target_date: string | null;
  position: number;
}

export interface ProjectDependency {
  blocking_project_id: string;
  blocked_project_id: string;
}

export interface ProjectUpdate {
  id: string;
  project_id: string;
  health: ProjectHealth;
  body: string;
  author_id: string | null;
  created_at: string;
}

export interface Issue {
  id: string;
  team_id: string;
  number: number;
  identifier: string;
  title: string;
  description: string;
  state_id: string;
  priority: number;
  estimate: number | null;
  assignee_id: string | null;
  creator_id: string | null;
  cycle_id: string | null;
  project_id: string | null;
  milestone_id: string | null;
  parent_id: string | null;
  due_date: string | null;
  sort_order: number;
  repo_id: string | null;
  github_issue_number: number | null;
  github_url: string | null;
  last_synced_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
  issue_labels?: { label_id: string }[];
}

export interface Comment {
  id: string;
  issue_id: string;
  author_id: string | null;
  github_author_login: string | null;
  body: string;
  is_internal: boolean;
  github_comment_id: number | null;
  created_at: string;
}

export interface PullRequest {
  id: string;
  number: number;
  title: string;
  url: string;
  state: 'draft' | 'open' | 'closed' | 'merged';
  review_state: 'none' | 'pending' | 'approved' | 'changes_requested';
  author_login: string | null;
  head_branch: string | null;
}

export interface IssueTemplate {
  id: string;
  team_id: string;
  name: string;
  title: string;
  description: string;
  priority: number;
  label_ids: string[];
}

export interface Doc {
  id: string;
  team_id: string | null;
  project_id: string | null;
  title: string;
  emoji: string;
  content: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  kind: CalendarKind;
  starts_on: string;
  ends_on: string;
}

export interface Activity {
  id: number;
  team_id: string | null;
  issue_id: string | null;
  project_id: string | null;
  actor_id: string | null;
  actor_github_login: string | null;
  verb: string;
  data: Record<string, unknown>;
  created_at: string;
}

export interface NotificationSettings {
  team_id: string;
  timezone: string;
  reminder_hour: number;
  due_soon_dm: boolean;
  due_soon_days: number;
  overdue_dm: boolean;
  sprint_start_digest: boolean;
  sprint_end_digest: boolean;
  feed_issue_created: boolean;
  feed_status_changed: boolean;
  feed_pr_opened: boolean;
  feed_pr_merged: boolean;
}
