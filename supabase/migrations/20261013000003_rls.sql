-- Row level security: leadership can only see and edit their own teams. Admins see everything.

alter table profiles enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table invites enable row level security;
alter table people enable row level security;
alter table repos enable row level security;
alter table workflow_states enable row level security;
alter table labels enable row level security;
alter table cycles enable row level security;
alter table cycle_snapshots enable row level security;
alter table projects enable row level security;
alter table project_teams enable row level security;
alter table milestones enable row level security;
alter table project_dependencies enable row level security;
alter table project_updates enable row level security;
alter table issues enable row level security;
alter table issue_labels enable row level security;
alter table comments enable row level security;
alter table pull_requests enable row level security;
alter table issue_pull_requests enable row level security;
alter table issue_templates enable row level security;
alter table documents enable row level security;
alter table calendar_events enable row level security;
alter table activity enable row level security;
alter table notification_settings enable row level security;
alter table notification_log enable row level security;
alter table integration_secrets enable row level security; -- no policies: service role only
alter table jobs enable row level security;                -- no policies: service role only

-- Profiles: everyone signed in can see names/avatars; you can edit your own name only.
create policy "profiles readable" on profiles for select to authenticated using (true);
revoke update on profiles from authenticated;
grant update (name, avatar_url) on profiles to authenticated;
create policy "edit own profile" on profiles for update to authenticated using (id = auth.uid());

-- Teams
create policy "teams read" on teams for select to authenticated using (is_team_member(id));
create policy "teams create" on teams for insert to authenticated with check (is_admin());
create policy "teams update" on teams for update to authenticated using (is_team_member(id));
create policy "teams delete" on teams for delete to authenticated using (is_admin());

-- Membership & invites: leads manage their own team, admins manage all
create policy "members read" on team_members for select to authenticated using (is_team_member(team_id));
create policy "members write" on team_members for all to authenticated
  using (is_team_member(team_id)) with check (is_team_member(team_id));

create policy "invites read" on invites for select to authenticated
  using (case when team_id is null then is_admin() else is_team_member(team_id) end);
create policy "invites write" on invites for all to authenticated
  using (case when team_id is null then is_admin() else is_team_member(team_id) end)
  with check (
    (case when team_id is null then is_admin() else is_team_member(team_id) end)
    and (not make_admin or is_admin())
  );

-- Simple team-scoped tables
do $$
declare t text;
begin
  foreach t in array array['people', 'repos', 'workflow_states', 'labels', 'cycles', 'issues',
                           'issue_templates', 'notification_settings']
  loop
    execute format(
      'create policy "team scoped" on %I for all to authenticated
         using (is_team_member(team_id)) with check (is_team_member(team_id))', t);
  end loop;
end $$;

create policy "snapshots read" on cycle_snapshots for select to authenticated
  using (is_team_member((select team_id from cycles where id = cycle_id)));

-- Issue children
create policy "issue labels" on issue_labels for all to authenticated
  using (is_team_member(issue_team(issue_id))) with check (is_team_member(issue_team(issue_id)));
create policy "comments read" on comments for select to authenticated
  using (is_team_member(issue_team(issue_id)));
create policy "comments create" on comments for insert to authenticated
  with check (is_team_member(issue_team(issue_id)) and author_id = auth.uid());
create policy "comments edit own" on comments for update to authenticated
  using (author_id = auth.uid());
create policy "comments delete own" on comments for delete to authenticated
  using (author_id = auth.uid());
create policy "issue prs read" on issue_pull_requests for select to authenticated
  using (is_team_member(issue_team(issue_id)));
create policy "prs read" on pull_requests for select to authenticated
  using (is_team_member((select team_id from repos where id = repo_id)));

-- Projects (may span teams)
-- created_by is checked inline: during `insert … returning` the new row isn't visible to
-- can_access_project() yet, so creators would otherwise be refused their own project.
create policy "projects read" on projects for select to authenticated
  using (created_by = auth.uid() or can_access_project(id));
create policy "projects create" on projects for insert to authenticated with check (created_by = auth.uid());
create policy "projects update" on projects for update to authenticated using (can_access_project(id));
create policy "projects delete" on projects for delete to authenticated using (can_access_project(id));

create policy "project teams read" on project_teams for select to authenticated
  using (can_access_project(project_id));
create policy "project teams write" on project_teams for all to authenticated
  using (is_team_member(team_id)) with check (is_team_member(team_id) and can_access_project(project_id));

do $$
declare t text;
begin
  foreach t in array array['milestones', 'project_updates']
  loop
    execute format(
      'create policy "project scoped" on %I for all to authenticated
         using (can_access_project(project_id)) with check (can_access_project(project_id))', t);
  end loop;
end $$;

create policy "deps" on project_dependencies for all to authenticated
  using (can_access_project(blocking_project_id) or can_access_project(blocked_project_id))
  with check (can_access_project(blocking_project_id) and can_access_project(blocked_project_id));

-- Documents belong to a team or a project
create policy "documents" on documents for all to authenticated
  using ((team_id is not null and is_team_member(team_id)) or (project_id is not null and can_access_project(project_id)))
  with check ((team_id is not null and is_team_member(team_id)) or (project_id is not null and can_access_project(project_id)));

-- Club calendar: everyone reads, admins edit
create policy "calendar read" on calendar_events for select to authenticated using (true);
create policy "calendar write" on calendar_events for all to authenticated using (is_admin()) with check (is_admin());

-- Activity is written by triggers; readable per team
create policy "activity read" on activity for select to authenticated
  using ((team_id is not null and is_team_member(team_id)) or (project_id is not null and can_access_project(project_id)));

create policy "notification log read" on notification_log for select to authenticated
  using (is_team_member(team_id));

-- Function privileges
revoke execute on function github_upsert_issue from public, anon, authenticated;
revoke execute on function github_advance_issue from public, anon, authenticated;
revoke execute on function claim_jobs from public, anon, authenticated;
revoke execute on function snapshot_cycle from public, anon, authenticated;
revoke execute on function enqueue_job from public, anon, authenticated;
revoke execute on function accept_invites_for from public, anon, authenticated;

-- Live updates for boards
alter publication supabase_realtime add table issues, comments, issue_pull_requests, pull_requests;
