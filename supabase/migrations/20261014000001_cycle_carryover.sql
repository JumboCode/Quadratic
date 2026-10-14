-- Remember how much work rolled out of a sprint when it was completed, so the end-of-sprint
-- digest can report it even after the issues have moved (e.g. a sprint completed early by hand).

alter table cycles
  add column carried_over_count integer,
  add column carried_over_points integer;

create or replace function rollover_cycle(p_cycle uuid, p_target uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare v_team uuid; v_count integer; v_points integer;
begin
  select team_id into v_team from cycles where id = p_cycle;
  if not is_team_member(v_team) and auth.role() <> 'service_role' then
    raise exception 'not allowed';
  end if;

  select count(*), coalesce(sum(coalesce(i.estimate, 1)), 0) into v_count, v_points
  from issues i join workflow_states s on s.id = i.state_id
  where i.cycle_id = p_cycle and s.category not in ('completed', 'canceled');

  update issues i set cycle_id = p_target
  from workflow_states s
  where i.state_id = s.id and i.cycle_id = p_cycle
    and s.category not in ('completed', 'canceled');

  update cycles set
    completed_at = coalesce(completed_at, now()),
    carried_over_count = coalesce(carried_over_count, 0) + v_count,
    carried_over_points = coalesce(carried_over_points, 0) + v_points
  where id = p_cycle;
  return v_count;
end;
$$;
