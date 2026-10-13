-- Background work: the `jobs` outbox is drained by the `dispatch` Edge Function, and `cron-tick`
-- handles reminders and sprint digests. Both are called through pg_net using two Vault secrets
-- (see docs/SETUP.md):
--   project_url      e.g. https://abcd.supabase.co
--   internal_secret  random string, also set as INTERNAL_SECRET for the Edge Functions

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create or replace function call_edge_function(p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'internal_secret';
  if v_url is null or v_secret is null then
    return; -- not configured yet (e.g. local dev without secrets)
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/' || p_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_secret),
    body := '{}'::jsonb
  );
end;
$$;
revoke execute on function call_edge_function from public, anon, authenticated;

-- Kick the dispatcher right away when new jobs arrive (cron below retries anything missed).
create or replace function jobs_kick() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform call_edge_function('dispatch');
  return null;
end;
$$;

create trigger jobs_kick after insert on jobs
  for each statement execute function jobs_kick();

-- Re-queue jobs stuck in processing (function crashed) and clean up old rows.
create or replace function jobs_maintenance() returns void
language sql security definer set search_path = public as $$
  update jobs set status = 'pending' where status = 'processing' and run_after < now() - interval '10 minutes';
  delete from jobs where status = 'done' and created_at < now() - interval '14 days';
$$;

select cron.schedule('quadratic-dispatch', '* * * * *', $$select call_edge_function('dispatch')$$);
select cron.schedule('quadratic-cron-tick', '*/15 * * * *', $$select call_edge_function('cron-tick')$$);
select cron.schedule('quadratic-jobs-maintenance', '7 * * * *', $$select jobs_maintenance()$$);
