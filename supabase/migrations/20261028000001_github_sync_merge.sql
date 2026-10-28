-- GitHub sync: merge changes instead of overwriting.
--
-- Before this, every push sent the planner's whole copy of an issue to GitHub (wiping assignees and
-- labels devs had added), and every webhook copied GitHub's open/closed state over the planner's
-- (so a "labeled" event undid a lead's status change that hadn't been pushed yet). Now each issue
-- remembers what GitHub last looked like, and each side only receives the fields the other changed.

alter table issues add column github_snapshot jsonb;

-- The team's first status in the first category that exists, so a deleted status never breaks sync.
create or replace function team_state(p_team uuid, p_cats state_category[]) returns uuid
language sql stable security definer set search_path = public as $$
  select id from workflow_states
  where team_id = p_team and category = any(p_cats)
  order by array_position(p_cats, category), position
  limit 1;
$$;

create or replace function github_person(p_team uuid, p_login text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_person uuid;
begin
  if p_login is null then return null; end if;
  select id into v_person from people where team_id = p_team and lower(github_login) = lower(p_login);
  if v_person is null then
    insert into people (team_id, name, github_login) values (p_team, p_login, p_login)
      on conflict (team_id, lower(github_login)) where github_login is not null do nothing
      returning id into v_person;
  end if;
  if v_person is null then -- another webhook added them first
    select id into v_person from people where team_id = p_team and lower(github_login) = lower(p_login);
  end if;
  return v_person;
end;
$$;

drop function github_upsert_issue(uuid, uuid, integer, bigint, text, text, text, boolean, text, text, text[], boolean);

-- Apply a GitHub issue to the planner as "from GitHub" so triggers don't echo it back. Fields GitHub
-- didn't change since the last snapshot are left alone, keeping planner edits that are still queued.
create or replace function github_upsert_issue(
  p_team uuid,
  p_repo uuid,
  p_number integer,
  p_github_id bigint,
  p_url text,
  p_title text,
  p_body text,
  p_has_footer boolean,
  p_open boolean,
  p_state_reason text,
  p_assignee_logins text[],
  p_label_names text[],
  p_updated_at timestamptz,
  p_create_if_missing boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_issue issues%rowtype;
  v_snap jsonb;
  v_state uuid;
  v_cat state_category;
  v_assignee uuid;
  v_login text;
  v_snap_assignee text;
  v_gh_assignees text[] := array(select lower(x) from unnest(coalesce(p_assignee_logins, '{}')) x);
  v_snap_assignees text[];
  v_gh_labels text[] := coalesce(p_label_names, '{}');
  v_snap_labels text[];
  v_label uuid;
  v_name text;
begin
  perform set_config('quadratic.sync_origin', 'github', true);
  -- GitHub sends opened + labeled + assigned at once; without this they race to insert the same issue.
  perform pg_advisory_xact_lock(hashtextextended(p_repo::text || '#' || p_number, 0));

  select * into v_issue from issues where repo_id = p_repo and github_issue_number = p_number;

  if v_issue.id is null then
    if not p_create_if_missing then return null; end if;
    v_state := team_state(p_team, case
      when p_open then array['triage', 'backlog', 'unstarted', 'started', 'review']
      when p_state_reason = 'not_planned' then array['canceled', 'completed']
      else array['completed', 'canceled'] end::state_category[]);
    if v_state is null then raise exception 'team % has no workflow states', p_team; end if;
    v_assignee := github_person(p_team, p_assignee_logins[1]);
    insert into issues (team_id, title, description, state_id, assignee_id, repo_id,
                        github_issue_number, github_issue_id, github_url, last_synced_at)
    values (p_team, p_title, coalesce(p_body, ''), v_state, v_assignee, p_repo,
            p_number, p_github_id, p_url, now())
    returning * into v_issue;
    v_snap_labels := '{}';
    v_snap_assignee := v_gh_assignees[1];
  else
    v_snap := v_issue.github_snapshot;
    -- Webhooks can arrive out of order; one older than what we've already applied has nothing new.
    if v_snap ? 'updated_at' and p_updated_at is not null and (v_snap ->> 'updated_at')::timestamptz > p_updated_at then
      return v_issue.id;
    end if;

    select category into v_cat from workflow_states where id = v_issue.state_id;
    select lower(github_login) into v_login from people where id = v_issue.assignee_id;

    if v_snap is null then
      -- Synced before snapshots existed: treat the planner as matching GitHub's previous version.
      v_snap := jsonb_build_object(
        'title', v_issue.title, 'body', v_issue.description, 'open', v_cat not in ('completed', 'canceled'),
        'labels', (select coalesce(jsonb_agg(l.name), '[]') from issue_labels il join labels l on l.id = il.label_id where il.issue_id = v_issue.id),
        'assignees', to_jsonb(array_remove(array[v_login], null)), 'assignee', v_login);
    end if;
    v_snap_labels := array(select jsonb_array_elements_text(coalesce(v_snap -> 'labels', '[]')));
    v_snap_assignees := array(select jsonb_array_elements_text(coalesce(v_snap -> 'assignees', '[]')));
    v_snap_assignee := v_snap ->> 'assignee';

    -- Status only moves when GitHub's open/closed actually changed.
    v_state := v_issue.state_id;
    if p_open is distinct from (v_snap ->> 'open')::boolean then
      if p_open and v_cat in ('completed', 'canceled') then
        v_state := coalesce(team_state(p_team, array['unstarted', 'backlog', 'triage', 'started', 'review']::state_category[]), v_state);
      elsif not p_open and v_cat not in ('completed', 'canceled') then
        v_state := coalesce(team_state(p_team, case when p_state_reason = 'not_planned'
          then array['canceled', 'completed'] else array['completed', 'canceled'] end::state_category[]), v_state);
      end if;
    end if;

    -- The planner has one assignee; GitHub can have several. Only follow GitHub when it removed the
    -- planner's assignee, or added someone while the planner had nobody.
    v_assignee := v_issue.assignee_id;
    if v_login = any(v_gh_assignees) then
      null;
    elsif v_login = any(v_snap_assignees) or (v_issue.assignee_id is null and v_snap_assignee is null) then
      v_assignee := github_person(p_team, coalesce(
        (select a from unnest(p_assignee_logins) a where lower(a) <> all(v_snap_assignees) limit 1),
        case when v_login is not null or v_issue.github_snapshot is null then p_assignee_logins[1] end));
    end if;

    update issues set
      title = case when p_title is distinct from v_snap ->> 'title' then p_title else title end,
      description = case when coalesce(p_body, '') is distinct from v_snap ->> 'body' then coalesce(p_body, '') else description end,
      state_id = v_state,
      assignee_id = v_assignee,
      github_issue_id = p_github_id,
      github_url = p_url,
      last_synced_at = now()
    where id = v_issue.id;
  end if;

  -- Labels: apply what GitHub added or removed since the snapshot.
  foreach v_name in array v_gh_labels loop
    continue when v_name = any(v_snap_labels);
    insert into labels (team_id, name) values (p_team, v_name)
      on conflict (team_id, name) do update set name = excluded.name
      returning id into v_label;
    insert into issue_labels (issue_id, label_id) values (v_issue.id, v_label) on conflict do nothing;
  end loop;
  delete from issue_labels il using labels l
  where il.issue_id = v_issue.id and l.id = il.label_id
    and l.name = any(v_snap_labels) and l.name <> all(v_gh_labels);

  select lower(github_login) into v_login from issues i join people p on p.id = i.assignee_id where i.id = v_issue.id;
  update issues set github_snapshot = jsonb_build_object(
    'title', p_title,
    'body', coalesce(p_body, ''),
    'footer', coalesce(p_has_footer, false),
    'open', p_open,
    'labels', to_jsonb(v_gh_labels),
    'assignees', to_jsonb(v_gh_assignees),
    -- Which GitHub assignee stands for the planner's; a push swaps only this one.
    'assignee', case when v_login = any(v_gh_assignees) then v_login
                     when v_snap_assignee = any(v_gh_assignees) then v_snap_assignee end,
    'updated_at', p_updated_at
  ) where id = v_issue.id;

  return v_issue.id;
end;
$$;

revoke execute on function github_upsert_issue from public, anon, authenticated;
revoke execute on function github_person from public, anon, authenticated;

-- Don't hand out a job while another job for the same entity is still running: two concurrent
-- pushes of a new issue would each create it on GitHub.
create or replace function claim_jobs(p_limit integer) returns setof jobs
language sql security definer set search_path = public as $$
  update jobs set status = 'processing', attempts = attempts + 1, run_after = now()
  where id in (
    select j.id from jobs j
    where j.status = 'pending' and j.run_after <= now()
      and not exists (
        select 1 from jobs r
        where r.status = 'processing' and r.kind = j.kind and r.entity_id = j.entity_id
      )
    order by j.id
    limit p_limit
    for update skip locked
  )
  returning *;
$$;

-- Re-queue stuck jobs, except where a newer pending job already covers the same entity (re-queueing
-- those would violate jobs_pending_dedupe and abort the whole cleanup).
create or replace function jobs_maintenance() returns void
language sql security definer set search_path = public as $$
  update jobs j set status = 'done', last_error = 'superseded by a newer pending job'
  where j.status = 'processing' and j.run_after < now() - interval '10 minutes' and j.entity_id is not null
    and exists (select 1 from jobs p where p.status = 'pending' and p.kind = j.kind and p.entity_id = j.entity_id);
  update jobs set status = 'pending' where status = 'processing' and run_after < now() - interval '10 minutes';
  delete from jobs where status = 'done' and created_at < now() - interval '14 days';
$$;
