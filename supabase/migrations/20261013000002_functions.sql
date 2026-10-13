-- Helper functions and triggers

-- ---------------------------------------------------------------------------
-- Access helpers (security definer so they can be used inside RLS policies)
-- ---------------------------------------------------------------------------

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

create or replace function is_team_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (
    select 1 from team_members where team_id = t and user_id = auth.uid()
  );
$$;

create or replace function can_access_project(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (
    select 1 from project_teams pt
    join team_members tm on tm.team_id = pt.team_id
    where pt.project_id = p and tm.user_id = auth.uid()
  ) or exists (
    -- a project with no teams yet is visible to its creator
    select 1 from projects where id = p and created_by = auth.uid()
      and not exists (select 1 from project_teams where project_id = p)
  );
$$;

create or replace function issue_team(i uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from issues where id = i;
$$;

-- ---------------------------------------------------------------------------
-- Sync-origin flag: set by the GitHub webhook so we don't echo its changes back.
-- ---------------------------------------------------------------------------

create or replace function from_github() returns boolean
language sql stable as $$
  select coalesce(current_setting('quadratic.sync_origin', true), '') = 'github';
$$;

-- ---------------------------------------------------------------------------
-- Signup: create profile, bootstrap first admin, accept invites
-- ---------------------------------------------------------------------------

create or replace function accept_invites_for(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_login text;
  inv record;
begin
  select lower(github_login) into v_login from profiles where id = p_user;
  if v_login is null then return; end if;

  for inv in
    select * from invites where lower(github_login) = v_login and accepted_at is null
  loop
    if inv.make_admin then
      update profiles set is_admin = true where id = p_user;
    end if;
    if inv.team_id is not null then
      insert into team_members (team_id, user_id, role)
      values (inv.team_id, p_user, inv.role)
      on conflict (team_id, user_id) do update set role = excluded.role;
    end if;
    update invites set accepted_at = now() where id = inv.id;
  end loop;
end;
$$;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, github_login, name, avatar_url, is_admin)
  values (
    new.id,
    new.raw_user_meta_data ->> 'user_name',
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'user_name'),
    new.raw_user_meta_data ->> 'avatar_url',
    -- the very first person to sign in becomes the club admin
    not exists (select 1 from profiles where is_admin)
  )
  on conflict (id) do nothing;
  perform accept_invites_for(new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Inviting someone who already has an account adds them right away.
create or replace function handle_new_invite() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  select id into v_user from profiles where lower(github_login) = lower(new.github_login);
  if v_user is not null then
    perform accept_invites_for(v_user);
  end if;
  return new;
end;
$$;

create trigger on_invite_created
  after insert on invites
  for each row execute function handle_new_invite();

create or replace function set_admin(p_user uuid, p_admin boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'only admins can change admins'; end if;
  if p_user = auth.uid() and not p_admin then raise exception 'you cannot remove your own admin role'; end if;
  update profiles set is_admin = p_admin where id = p_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- Team defaults
-- ---------------------------------------------------------------------------

create or replace function handle_new_team() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s_started uuid; s_review uuid; s_done uuid;
begin
  insert into workflow_states (team_id, name, category, color, position) values
    (new.id, 'Triage',      'triage',    '#f59e0b', 0),
    (new.id, 'Backlog',     'backlog',   '#94a3b8', 1),
    (new.id, 'Todo',        'unstarted', '#64748b', 2);
  insert into workflow_states (team_id, name, category, color, position)
    values (new.id, 'In Progress', 'started', '#eab308', 3) returning id into s_started;
  insert into workflow_states (team_id, name, category, color, position)
    values (new.id, 'In Review', 'review', '#8b5cf6', 4) returning id into s_review;
  insert into workflow_states (team_id, name, category, color, position)
    values (new.id, 'Done', 'completed', '#2EAD5B', 5) returning id into s_done;
  insert into workflow_states (team_id, name, category, color, position)
    values (new.id, 'Canceled', 'canceled', '#ef4444', 6);

  update teams set pr_opened_state_id = s_started, pr_review_state_id = s_review, pr_merged_state_id = s_done
  where id = new.id;

  insert into labels (team_id, name, color) values
    (new.id, 'bug', '#ef4444'),
    (new.id, 'feature', '#3b82f6'),
    (new.id, 'design', '#ec4899'),
    (new.id, 'chore', '#94a3b8');

  insert into issue_templates (team_id, name, title, description, priority) values
    (new.id, 'Bug report', '[Bug] ', E'## What happened?\n\n## Steps to reproduce\n1. \n\n## Expected behavior\n', 2),
    (new.id, 'Feature', '', E'## Goal\n\n## Acceptance criteria\n- [ ] \n\n## Design\n', 0),
    (new.id, 'Design task', '[Design] ', E'## What needs designing?\n\n## Figma link\n\n## Handoff checklist\n- [ ] ', 0);

  insert into notification_settings (team_id) values (new.id);
  return new;
end;
$$;

create trigger on_team_created
  after insert on teams
  for each row execute function handle_new_team();

-- ---------------------------------------------------------------------------
-- Issues: numbering, timestamps, default repo, activity, outbox
-- ---------------------------------------------------------------------------

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger issues_touch before update on issues for each row execute function touch_updated_at();
create trigger comments_touch before update on comments for each row execute function touch_updated_at();
create trigger documents_touch before update on documents for each row execute function touch_updated_at();
create trigger projects_touch before update on projects for each row execute function touch_updated_at();

create or replace function issue_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_key text; v_num integer;
begin
  update teams set issue_counter = issue_counter + 1 where id = new.team_id
    returning key, issue_counter into v_key, v_num;
  new.number := v_num;
  new.identifier := v_key || '-' || v_num;
  if new.repo_id is null then
    select id into new.repo_id from repos where team_id = new.team_id and is_default;
  end if;
  if new.creator_id is null and not from_github() then
    new.creator_id := auth.uid();
  end if;
  return new;
end;
$$;

create trigger issues_before_insert before insert on issues
  for each row execute function issue_before_insert();

create or replace function issue_state_timestamps() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cat state_category;
begin
  if tg_op = 'INSERT' or new.state_id is distinct from old.state_id then
    select category into v_cat from workflow_states where id = new.state_id;
    new.completed_at := case when v_cat = 'completed' then coalesce(new.completed_at, now()) end;
    new.canceled_at := case when v_cat = 'canceled' then coalesce(new.canceled_at, now()) end;
  end if;
  return new;
end;
$$;

create trigger issues_state_ts before insert or update on issues
  for each row execute function issue_state_timestamps();

create or replace function enqueue_job(p_kind text, p_entity uuid, p_payload jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into jobs (kind, entity_id, payload) values (p_kind, p_entity, p_payload)
  on conflict (kind, entity_id) where status = 'pending' and entity_id is not null do nothing;
$$;

create or replace function issue_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_old_state text; v_new_state text;
begin
  if tg_op = 'INSERT' then
    insert into activity (team_id, issue_id, actor_id, verb, data)
    values (new.team_id, new.id, v_actor, 'created', jsonb_build_object('title', new.title));
    perform enqueue_job('slack.feed', null, jsonb_build_object('event', 'issue_created', 'issue_id', new.id));
  else
    if new.state_id is distinct from old.state_id then
      select name into v_old_state from workflow_states where id = old.state_id;
      select name into v_new_state from workflow_states where id = new.state_id;
      insert into activity (team_id, issue_id, actor_id, verb, data)
      values (new.team_id, new.id, v_actor, 'state_changed',
              jsonb_build_object('from', v_old_state, 'to', v_new_state));
      perform enqueue_job('slack.feed', null, jsonb_build_object(
        'event', 'status_changed', 'issue_id', new.id, 'from', v_old_state, 'to', v_new_state));
    end if;
    if new.assignee_id is distinct from old.assignee_id then
      insert into activity (team_id, issue_id, actor_id, verb, data)
      values (new.team_id, new.id, v_actor, 'assigned',
              jsonb_build_object('person', (select name from people where id = new.assignee_id)));
    end if;
    if new.priority is distinct from old.priority then
      insert into activity (team_id, issue_id, actor_id, verb, data)
      values (new.team_id, new.id, v_actor, 'priority_changed', jsonb_build_object('to', new.priority));
    end if;
    if new.cycle_id is distinct from old.cycle_id then
      insert into activity (team_id, issue_id, actor_id, verb, data)
      values (new.team_id, new.id, v_actor, 'cycle_changed',
              jsonb_build_object('cycle', (select number from cycles where id = new.cycle_id)));
    end if;
  end if;

  -- Push to GitHub unless this change came from GitHub, and only if a repo is linked.
  if new.repo_id is not null and not from_github() and (
    tg_op = 'INSERT'
    or new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.state_id is distinct from old.state_id
    or new.assignee_id is distinct from old.assignee_id
  ) then
    perform enqueue_job('github.upsert_issue', new.id);
  end if;
  return null;
end;
$$;

create trigger issues_after_change after insert or update on issues
  for each row execute function issue_after_change();

create or replace function issue_labels_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_issue uuid := coalesce(new.issue_id, old.issue_id);
begin
  if not from_github() and exists (select 1 from issues where id = v_issue and repo_id is not null) then
    perform enqueue_job('github.upsert_issue', v_issue);
  end if;
  return null;
end;
$$;

create trigger issue_labels_changed after insert or delete on issue_labels
  for each row execute function issue_labels_changed();

create or replace function comment_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not from_github() and not new.is_internal and new.github_comment_id is null
     and exists (select 1 from issues where id = new.issue_id and github_issue_number is not null) then
    perform enqueue_job('github.create_comment', new.id);
  end if;
  insert into activity (team_id, issue_id, actor_id, actor_github_login, verb, data)
  values (issue_team(new.issue_id), new.issue_id, new.author_id, new.github_author_login, 'commented',
          jsonb_build_object('internal', new.is_internal));
  return null;
end;
$$;

create trigger comments_after_insert after insert on comments
  for each row execute function comment_after_insert();

-- ---------------------------------------------------------------------------
-- RPCs used by the app
-- ---------------------------------------------------------------------------

-- Move a whole cycle's unfinished issues to another cycle (or the backlog when null).
create or replace function rollover_cycle(p_cycle uuid, p_target uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare v_team uuid; v_count integer;
begin
  select team_id into v_team from cycles where id = p_cycle;
  if not is_team_member(v_team) and auth.role() <> 'service_role' then
    raise exception 'not allowed';
  end if;
  update issues i set cycle_id = p_target
  from workflow_states s
  where i.state_id = s.id and i.cycle_id = p_cycle
    and s.category not in ('completed', 'canceled');
  get diagnostics v_count = row_count;
  update cycles set completed_at = coalesce(completed_at, now()) where id = p_cycle;
  return v_count;
end;
$$;

-- What the browser may know about integrations (never the tokens).
create or replace function integration_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'slack', (select jsonb_build_object('team_name', value ->> 'team_name', 'connected_at', updated_at)
              from integration_secrets where key = 'slack'),
    'jobs_failed', (select count(*) from jobs where status = 'failed' and created_at > now() - interval '7 days')
  ) where auth.uid() is not null;
$$;

-- Webhook helper: apply a GitHub issue to the planner as "from GitHub" so triggers don't echo it back.
create or replace function github_upsert_issue(
  p_team uuid,
  p_repo uuid,
  p_number integer,
  p_github_id bigint,
  p_url text,
  p_title text,
  p_body text,
  p_open boolean,
  p_state_reason text,
  p_assignee_login text,
  p_label_names text[],
  p_create_if_missing boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_issue issues%rowtype;
  v_state uuid;
  v_cat state_category;
  v_person uuid;
  v_label uuid;
  v_name text;
begin
  perform set_config('quadratic.sync_origin', 'github', true);

  select * into v_issue from issues where repo_id = p_repo and github_issue_number = p_number;

  if p_assignee_login is not null then
    select id into v_person from people
      where team_id = p_team and lower(github_login) = lower(p_assignee_login);
    if v_person is null then
      insert into people (team_id, name, github_login)
      values (p_team, p_assignee_login, p_assignee_login) returning id into v_person;
    end if;
  end if;

  if v_issue.id is null then
    if not p_create_if_missing then return null; end if;
    select id into v_state from workflow_states
      where team_id = p_team and category = (case when p_open then 'triage' else 'completed' end)::state_category
      order by position limit 1;
    insert into issues (team_id, title, description, state_id, assignee_id, repo_id,
                        github_issue_number, github_issue_id, github_url, last_synced_at)
    values (p_team, p_title, coalesce(p_body, ''), v_state, v_person, p_repo,
            p_number, p_github_id, p_url, now())
    returning * into v_issue;
  else
    select category into v_cat from workflow_states where id = v_issue.state_id;
    v_state := v_issue.state_id;
    if p_open and v_cat in ('completed', 'canceled') then
      select id into v_state from workflow_states
        where team_id = p_team and category = 'unstarted' order by position limit 1;
    elsif not p_open and v_cat not in ('completed', 'canceled') then
      select id into v_state from workflow_states
        where team_id = p_team
          and category = (case when p_state_reason = 'not_planned' then 'canceled' else 'completed' end)::state_category
        order by position limit 1;
    end if;
    update issues set
      title = p_title,
      description = coalesce(p_body, ''),
      state_id = v_state,
      assignee_id = v_person,
      github_issue_id = p_github_id,
      github_url = p_url,
      last_synced_at = now()
    where id = v_issue.id;
  end if;

  if p_label_names is not null then
    delete from issue_labels where issue_id = v_issue.id;
    foreach v_name in array p_label_names loop
      insert into labels (team_id, name) values (p_team, v_name)
        on conflict (team_id, name) do update set name = excluded.name
        returning id into v_label;
      insert into issue_labels (issue_id, label_id) values (v_issue.id, v_label) on conflict do nothing;
    end loop;
  end if;

  return v_issue.id;
end;
$$;

-- Move an issue forward because of PR activity. Never moves backward or out of a closed state.
create or replace function github_advance_issue(p_issue uuid, p_target_state uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_cur state_category; v_tgt state_category;
  v_order constant state_category[] := array['triage','backlog','unstarted','started','review','completed']::state_category[];
begin
  if p_target_state is null then return false; end if;
  select s.category into v_cur from issues i join workflow_states s on s.id = i.state_id where i.id = p_issue;
  select category into v_tgt from workflow_states where id = p_target_state;
  if v_cur = 'canceled' or array_position(v_order, v_tgt) <= array_position(v_order, v_cur) then
    return false;
  end if;
  -- The status change itself is mirrored to GitHub (e.g. closing on merge), so don't flag as from_github.
  update issues set state_id = p_target_state where id = p_issue;
  return true;
end;
$$;

-- Atomically claim pending jobs for the dispatcher.
create or replace function claim_jobs(p_limit integer) returns setof jobs
language sql security definer set search_path = public as $$
  -- run_after doubles as "claimed at" so jobs_maintenance() can rescue stuck jobs
  update jobs set status = 'processing', attempts = attempts + 1, run_after = now()
  where id in (
    select id from jobs
    where status = 'pending' and run_after <= now()
    order by id
    limit p_limit
    for update skip locked
  )
  returning *;
$$;

create or replace function snapshot_cycle(p_cycle uuid, p_day date) returns void
language sql security definer set search_path = public as $$
  insert into cycle_snapshots (cycle_id, day, scope_count, completed_count, scope_points, completed_points)
  select p_cycle, p_day,
    count(*) filter (where s.category <> 'canceled'),
    count(*) filter (where s.category = 'completed'),
    coalesce(sum(coalesce(i.estimate, 1)) filter (where s.category <> 'canceled'), 0),
    coalesce(sum(coalesce(i.estimate, 1)) filter (where s.category = 'completed'), 0)
  from issues i join workflow_states s on s.id = i.state_id
  where i.cycle_id = p_cycle
  on conflict (cycle_id, day) do update set
    scope_count = excluded.scope_count,
    completed_count = excluded.completed_count,
    scope_points = excluded.scope_points,
    completed_points = excluded.completed_points;
$$;
