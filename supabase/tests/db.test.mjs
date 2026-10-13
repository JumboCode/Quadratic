// Applies supabase/migrations to PGlite (Postgres in WASM) with stubs for Supabase-only pieces
// (auth, vault, pg_net, pg_cron), then checks RLS, triggers and the GitHub-sync RPCs.
// Run: cd supabase/tests && npm install && npm test
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const migDir = process.argv[2] ?? fileURLToPath(new URL('../migrations', import.meta.url));
const db = new PGlite();

const prelude = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
create schema auth;
create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
grant usage on schema auth to anon, authenticated, service_role;
create schema extensions; create schema vault; create schema net; create schema cron;
create table vault.decrypted_secrets (name text, decrypted_secret text);
create table net.calls (url text, at timestamptz default now());
create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language sql as $$ insert into net.calls(url) values (url); select 1::bigint $$;
create table cron.jobs (name text, schedule text, command text);
create function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.jobs values (n, s, c); select 1::bigint $$;
create publication supabase_realtime;
`;
await db.exec(prelude);

for (const f of fs.readdirSync(migDir).sort()) {
  let sql = fs.readFileSync(path.join(migDir, f), 'utf8');
  sql = sql.replace(/^create extension.*$/gm, '-- (stripped extension)');
  try {
    await db.exec(sql);
    console.log('applied', f);
  } catch (e) {
    console.error('FAILED', f, e.message);
    process.exit(1);
  }
}

let failures = 0;
const ok = (cond, msg) => { console.log(cond ? '  ✓' : '  ✗', msg); if (!cond) failures++; };
const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';

async function as(user, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false); select set_config('request.jwt.claim.role', 'authenticated', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); select set_config('request.jwt.claim.role', '', false);`); }
}
async function asService(fn) {
  await db.exec(`set role service_role; select set_config('request.jwt.claim.role', 'service_role', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.role', '', false);`); }
}
const q = async (sql, params) => (await db.query(sql, params)).rows;
const fails = async (fn) => { try { await fn(); return false; } catch { return true; } };

console.log('\nSignup & admin bootstrap');
await q(`insert into auth.users values ($1, '{"user_name":"alice","full_name":"Alice A"}')`, [A]);
await q(`insert into auth.users values ($1, '{"user_name":"Bob","full_name":"Bob B"}')`, [B]);
const profs = await q(`select github_login, is_admin from profiles order by github_login`);
ok(profs.find((p) => p.github_login === 'alice').is_admin === true, 'first user is admin');
ok(profs.find((p) => p.github_login === 'Bob').is_admin === false, 'second user is not admin');

console.log('\nTeams, defaults, invites');
const [web] = await as(A, () => q(`insert into teams (name, key) values ('Web', 'WEB') returning id`));
const [des] = await as(A, () => q(`insert into teams (name, key) values ('Design', 'DES') returning id`));
const states = await q(`select name, category, id from workflow_states where team_id = $1 order by position`, [web.id]);
ok(states.length === 7, `7 default states (${states.map((s) => s.name).join(', ')})`);
const t = (await q(`select * from teams where id = $1`, [web.id]))[0];
ok(t.pr_opened_state_id && t.pr_review_state_id && t.pr_merged_state_id, 'PR automation defaults set');
ok((await q(`select count(*)::int c from notification_settings where team_id = $1`, [web.id]))[0].c === 1, 'notification settings row');
ok((await q(`select count(*)::int c from issue_templates where team_id = $1`, [web.id]))[0].c === 3, 'templates seeded');
await as(A, () => q(`insert into invites (team_id, github_login, role) values ($1, 'bob', 'pm')`, [web.id]));
ok((await q(`select role from team_members where user_id = $1`, [B]))[0]?.role === 'pm', 'existing user invited by case-insensitive login is added immediately');
ok(await fails(() => as(B, () => q(`insert into teams (name, key) values ('X', 'XX')`))), 'non-admin cannot create teams');

console.log('\nRLS isolation');
const visible = await as(B, () => q(`select key from teams`));
ok(visible.length === 1 && visible[0].key === 'WEB', 'bob only sees WEB');
const todo = states.find((s) => s.category === 'unstarted');
const desTodo = (await q(`select id from workflow_states where team_id = $1 and category = 'unstarted'`, [des.id]))[0];
ok(await fails(() => as(B, () => q(`insert into issues (team_id, title, state_id) values ($1, 'x', $2)`, [des.id, desTodo.id]))), 'bob cannot create issues in DES');
ok(await fails(() => as(B, () => q(`update profiles set is_admin = true where id = $1`, [B]))), 'bob cannot self-promote');
ok(await fails(() => as(B, () => q(`select * from integration_secrets`))) || (await as(B, () => q(`select * from integration_secrets`))).length === 0, 'secrets hidden');
ok(await fails(() => as(B, () => q(`select set_admin($1, true)`, [B]))), 'set_admin rejects non-admins');

console.log('\nIssues, numbering, outbox');
const [i1] = await as(B, () => q(`insert into issues (team_id, title, state_id) values ($1, 'First', $2) returning *`, [web.id, todo.id]));
ok(i1.identifier === 'WEB-1' && i1.creator_id === B, `numbered ${i1.identifier}, creator set`);
ok((await q(`select count(*)::int c from jobs where kind = 'github.upsert_issue'`))[0].c === 0, 'no GitHub job without a repo');
ok((await q(`select count(*)::int c from jobs where kind = 'slack.feed'`))[0].c === 1, 'slack feed job for new issue');
ok((await q(`select count(*)::int c from net.calls`))[0].c === 0, 'no pg_net call without vault secrets');
await as(B, () => q(`insert into repos (team_id, github_repo_id, installation_id, full_name, is_default) values ($1, 99, 1, 'jumbocode/web', true)`, [web.id]));
const [i2] = await as(B, () => q(`insert into issues (team_id, title, state_id) values ($1, 'Second', $2) returning *`, [web.id, todo.id]));
ok(i2.repo_id !== null, 'default repo applied');
await as(B, () => q(`update issues set title = 'Second!' where id = $1`, [i2.id]));
await as(B, () => q(`update issues set description = 'hi' where id = $1`, [i2.id]));
ok((await q(`select count(*)::int c from jobs where kind = 'github.upsert_issue' and entity_id = $1`, [i2.id]))[0].c === 1, 'repeated edits collapse into one pending push');
const done = states.find((s) => s.category === 'completed');
await as(B, () => q(`update issues set state_id = $2 where id = $1`, [i2.id, done.id]));
ok((await q(`select completed_at from issues where id = $1`, [i2.id]))[0].completed_at !== null, 'completed_at stamped');
ok((await q(`select count(*)::int c from activity where issue_id = $1 and verb = 'state_changed'`, [i2.id]))[0].c === 1, 'activity logged');

console.log('\nGitHub webhook RPCs');
const [{ github_upsert_issue: ghId }] = await asService(() => q(
  `select github_upsert_issue($1, $2, 5, 555, 'https://github.com/jumbocode/web/issues/5', 'From GH', 'body', true, null, 'Carol', array['bug','new-label'], true)`,
  [web.id, i2.repo_id],
));
const gh = (await q(`select i.*, s.category from issues i join workflow_states s on s.id = i.state_id where i.id = $1`, [ghId]))[0];
ok(gh.category === 'triage', 'GitHub-opened issue lands in triage');
ok((await q(`select name from people where id = $1`, [gh.assignee_id]))[0]?.name === 'Carol', 'unknown assignee auto-added as a person');
ok((await q(`select count(*)::int c from issue_labels where issue_id = $1`, [ghId]))[0].c === 2, 'labels synced (new label created)');
ok((await q(`select count(*)::int c from jobs where kind = 'github.upsert_issue' and entity_id = $1`, [ghId]))[0].c === 0, 'no echo back to GitHub');
await asService(() => q(`select github_upsert_issue($1, $2, 5, 555, 'u', 'From GH', 'body', false, 'not_planned', null, null, false)`, [web.id, i2.repo_id]));
ok((await q(`select s.category from issues i join workflow_states s on s.id = i.state_id where i.id = $1`, [ghId]))[0].category === 'canceled', 'closed as not planned → Canceled');
await asService(() => q(`select github_upsert_issue($1, $2, 5, 555, 'u', 'From GH', 'body', true, null, null, null, false)`, [web.id, i2.repo_id]));
ok((await q(`select s.category from issues i join workflow_states s on s.id = i.state_id where i.id = $1`, [ghId]))[0].category === 'unstarted', 'reopened → Todo');
const moved = (await asService(() => q(`select github_advance_issue($1, $2) r`, [ghId, t.pr_review_state_id])))[0].r;
const back = (await asService(() => q(`select github_advance_issue($1, $2) r`, [ghId, t.pr_opened_state_id])))[0].r;
ok(moved === true && back === false, 'PR automation only moves forward');
ok((await q(`select count(*)::int c from jobs where kind = 'github.upsert_issue' and entity_id = $1 and status = 'pending'`, [ghId]))[0].c === 1, 'PR-driven status change is pushed to GitHub');

console.log('\nComments');
await q(`update issues set github_issue_number = 2 where id = $1`, [i2.id]);
await as(B, () => q(`insert into comments (issue_id, author_id, body) values ($1, $2, 'public')`, [i2.id, B]));
await as(B, () => q(`insert into comments (issue_id, author_id, body, is_internal) values ($1, $2, 'secret', true)`, [i2.id, B]));
ok((await q(`select count(*)::int c from jobs where kind = 'github.create_comment'`))[0].c === 1, 'only the public comment goes to GitHub');
ok(await fails(() => as(B, () => q(`insert into comments (issue_id, author_id, body) values ($1, $2, 'spoof')`, [i2.id, A]))), 'cannot comment as someone else');

console.log('\nCycles');
const [c1] = await as(B, () => q(`insert into cycles (team_id, number, starts_on, ends_on) values ($1, 1, '2026-09-01', '2026-09-14') returning id`, [web.id]));
const [c2] = await as(B, () => q(`insert into cycles (team_id, number, starts_on, ends_on) values ($1, 2, '2026-09-15', '2026-09-28') returning id`, [web.id]));
await as(B, () => q(`update issues set cycle_id = $1 where team_id = $2`, [c1.id, web.id]));
await asService(() => q(`select snapshot_cycle($1, '2026-09-10')`, [c1.id]));
const snap = (await q(`select * from cycle_snapshots where cycle_id = $1`, [c1.id]))[0];
ok(snap && snap.completed_count === 1, `snapshot: ${snap?.completed_count}/${snap?.scope_count} done`);
const rolled = (await as(B, () => q(`select rollover_cycle($1, $2) n`, [c1.id, c2.id])))[0].n;
ok(rolled === 2, `rollover moved ${rolled} unfinished issues (done & canceled stay)`);
ok(await fails(() => as(A, () => q(`select 1`)).then(() => as(B, () => q(`select rollover_cycle($1, null)`, ['00000000-0000-0000-0000-000000000000'])))), 'rollover of unknown cycle rejected');

console.log('\nProjects');
const [p] = await as(B, () => q(`insert into projects (name, created_by) values ('MVP', $1) returning id`, [B]));
await as(B, () => q(`insert into project_teams values ($1, $2)`, [p.id, web.id]));
ok((await as(B, () => q(`select id from projects`))).length === 1, 'creator sees project');
ok(await fails(() => as(B, () => q(`insert into project_teams values ($1, $2)`, [p.id, des.id]))), 'cannot attach project to a team you are not on');

console.log('\nJobs');
const claimed = await asService(() => q(`select * from claim_jobs(100)`));
ok(claimed.length > 0 && claimed.every((j) => j.status === 'processing'), `claimed ${claimed.length} jobs`);
ok((await asService(() => q(`select * from claim_jobs(100)`))).length === 0, 'claimed jobs are not handed out twice');
await q(`insert into vault.decrypted_secrets values ('project_url', 'https://x.supabase.co'), ('internal_secret', 's')`);
await q(`select enqueue_job('slack.feed', null, '{}')`);
ok((await q(`select count(*)::int c from net.calls where url like '%/dispatch'`))[0].c === 1, 'new job kicks the dispatcher via pg_net');
ok((await q(`select count(*)::int c from cron.jobs`))[0].c === 3, 'cron schedules registered');

console.log(failures ? `\n${failures} FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
