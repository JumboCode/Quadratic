-- Quadratic core schema
-- Teams are "workspaces". Leadership (profiles) log in; devs are "people" who only live in GitHub.

create extension if not exists pgcrypto;

create type team_role as enum ('pm', 'tech_lead', 'designer');
create type state_category as enum ('triage', 'backlog', 'unstarted', 'started', 'review', 'completed', 'canceled');
create type project_status as enum ('planned', 'in_progress', 'paused', 'completed', 'canceled');
create type project_health as enum ('on_track', 'at_risk', 'off_track');
create type calendar_kind as enum ('break', 'finals', 'event', 'deadline');
create type pr_state as enum ('draft', 'open', 'closed', 'merged');
create type review_state as enum ('none', 'pending', 'approved', 'changes_requested');
create type job_status as enum ('pending', 'processing', 'done', 'failed');

-- ---------------------------------------------------------------------------
-- People & teams
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  github_login text unique,
  name text,
  avatar_url text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key text not null unique check (key ~ '^[A-Z][A-Z0-9]{1,5}$'),
  description text,
  color text not null default '#2EAD5B',
  emoji text not null default '🐘',
  academic_year text,
  archived boolean not null default false,
  issue_counter integer not null default 0,
  slack_channel_id text,
  slack_channel_name text,
  -- GitHub PR automation targets (workflow_states of this team); null = don't move
  pr_opened_state_id uuid,
  pr_review_state_id uuid,
  pr_merged_state_id uuid,
  created_at timestamptz not null default now()
);

create table team_members (
  team_id uuid not null references teams on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  role team_role not null,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index on team_members (user_id);

-- Invite by GitHub username. team_id null + make_admin = club admin invite.
create table invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams on delete cascade,
  github_login text not null,
  role team_role,
  make_admin boolean not null default false,
  invited_by uuid references profiles on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (team_id is not null or make_admin),
  check (team_id is null or role is not null)
);
create index on invites (lower(github_login)) where accepted_at is null;

-- Developers (and anyone assignable). They never log in.
create table people (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams on delete cascade,
  name text not null,
  github_login text,
  email text,
  slack_user_id text,
  profile_id uuid references profiles on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index people_team_github on people (team_id, lower(github_login)) where github_login is not null;

create table repos (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams on delete cascade,
  github_repo_id bigint not null,
  installation_id bigint not null,
  full_name text not null,
  default_branch text not null default 'main',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (github_repo_id)
);
create unique index repos_one_default on repos (team_id) where is_default;

create table workflow_states (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams on delete cascade,
  name text not null,
  category state_category not null,
  color text not null,
  position integer not null default 0
);
create index on workflow_states (team_id);

alter table teams
  add foreign key (pr_opened_state_id) references workflow_states on delete set null,
  add foreign key (pr_review_state_id) references workflow_states on delete set null,
  add foreign key (pr_merged_state_id) references workflow_states on delete set null;

create table labels (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams on delete cascade,
  name text not null,
  color text not null default '#94a3b8',
  unique (team_id, name)
);

-- ---------------------------------------------------------------------------
-- Planning: cycles, projects, milestones
-- ---------------------------------------------------------------------------

create table cycles (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams on delete cascade,
  number integer not null,
  name text,
  goal text,
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (team_id, number)
);

create table cycle_snapshots (
  cycle_id uuid not null references cycles on delete cascade,
  day date not null,
  scope_count integer not null,
  completed_count integer not null,
  scope_points integer not null,
  completed_points integer not null,
  primary key (cycle_id, day)
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  emoji text not null default '🚀',
  color text not null default '#2EAD5B',
  status project_status not null default 'planned',
  health project_health,
  lead_id uuid references profiles on delete set null,
  start_date date,
  target_date date,
  created_by uuid references profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table project_teams (
  project_id uuid not null references projects on delete cascade,
  team_id uuid not null references teams on delete cascade,
  primary key (project_id, team_id)
);
create index on project_teams (team_id);

create table milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  name text not null,
  description text,
  target_date date,
  position integer not null default 0
);

create table project_dependencies (
  blocking_project_id uuid not null references projects on delete cascade,
  blocked_project_id uuid not null references projects on delete cascade,
  primary key (blocking_project_id, blocked_project_id),
  check (blocking_project_id <> blocked_project_id)
);

create table project_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  health project_health not null,
  body text not null,
  author_id uuid references profiles on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Issues
-- ---------------------------------------------------------------------------

create table issues (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams on delete cascade,
  number integer not null,
  identifier text not null,
  title text not null,
  description text not null default '',
  state_id uuid not null references workflow_states,
  priority smallint not null default 0 check (priority between 0 and 4), -- 0 none, 1 urgent, 2 high, 3 medium, 4 low
  estimate smallint check (estimate >= 0),
  assignee_id uuid references people on delete set null,
  creator_id uuid references profiles on delete set null,
  cycle_id uuid references cycles on delete set null,
  project_id uuid references projects on delete set null,
  milestone_id uuid references milestones on delete set null,
  parent_id uuid references issues on delete set null,
  due_date date,
  sort_order double precision not null default extract(epoch from now()),
  repo_id uuid references repos on delete set null,
  github_issue_number integer,
  github_issue_id bigint,
  github_url text,
  last_synced_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, number),
  unique (repo_id, github_issue_number)
);
create index on issues (team_id, state_id);
create index on issues (cycle_id);
create index on issues (project_id);
create index on issues (assignee_id);
create index on issues (due_date) where due_date is not null;

create table issue_labels (
  issue_id uuid not null references issues on delete cascade,
  label_id uuid not null references labels on delete cascade,
  primary key (issue_id, label_id)
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references issues on delete cascade,
  author_id uuid references profiles on delete set null,
  github_author_login text,
  body text not null,
  is_internal boolean not null default false,
  github_comment_id bigint unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on comments (issue_id);

create table pull_requests (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references repos on delete cascade,
  number integer not null,
  title text not null,
  url text not null,
  state pr_state not null,
  review_state review_state not null default 'none',
  author_login text,
  head_branch text,
  base_branch text,
  merged_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (repo_id, number)
);

create table issue_pull_requests (
  issue_id uuid not null references issues on delete cascade,
  pull_request_id uuid not null references pull_requests on delete cascade,
  primary key (issue_id, pull_request_id)
);

create table issue_templates (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams on delete cascade,
  name text not null,
  title text not null default '',
  description text not null default '',
  priority smallint not null default 0,
  label_ids uuid[] not null default '{}'
);

-- ---------------------------------------------------------------------------
-- Docs, calendar, activity
-- ---------------------------------------------------------------------------

create table documents (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams on delete cascade,
  project_id uuid references projects on delete cascade,
  title text not null default 'Untitled',
  emoji text not null default '📄',
  content text not null default '',
  created_by uuid references profiles on delete set null,
  updated_by uuid references profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (team_id is not null or project_id is not null)
);

create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind calendar_kind not null default 'event',
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  created_by uuid references profiles on delete set null
);

create table activity (
  id bigint generated always as identity primary key,
  team_id uuid references teams on delete cascade,
  issue_id uuid references issues on delete cascade,
  project_id uuid references projects on delete cascade,
  actor_id uuid references profiles on delete set null,
  actor_github_login text,
  verb text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on activity (team_id, created_at desc);
create index on activity (issue_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Notifications & integrations
-- ---------------------------------------------------------------------------

create table notification_settings (
  team_id uuid primary key references teams on delete cascade,
  timezone text not null default 'America/New_York',
  reminder_hour smallint not null default 10 check (reminder_hour between 0 and 23),
  due_soon_dm boolean not null default true,
  due_soon_days smallint not null default 2 check (due_soon_days between 0 and 14),
  overdue_dm boolean not null default true,
  sprint_start_digest boolean not null default true,
  sprint_end_digest boolean not null default true,
  feed_issue_created boolean not null default true,
  feed_status_changed boolean not null default false,
  feed_pr_opened boolean not null default true,
  feed_pr_merged boolean not null default true
);

create table notification_log (
  id bigint generated always as identity primary key,
  team_id uuid references teams on delete cascade,
  kind text not null,
  dedupe_key text not null unique,
  sent_at timestamptz not null default now()
);

-- Secrets (Slack bot token, etc). RLS enabled with no policies => service role only.
create table integration_secrets (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Outbox of side effects (GitHub pushes, Slack posts) processed by the `dispatch` function.
create table jobs (
  id bigint generated always as identity primary key,
  kind text not null,
  entity_id uuid,
  payload jsonb not null default '{}',
  status job_status not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  run_after timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on jobs (status, run_after);
-- Collapse repeated pushes of the same entity while one is still pending.
create unique index jobs_pending_dedupe on jobs (kind, entity_id) where status = 'pending' and entity_id is not null;
