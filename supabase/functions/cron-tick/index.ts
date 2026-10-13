// Runs every 15 minutes (pg_cron). Per team, in the team's timezone:
//  - due-soon and overdue DMs at the team's reminder hour
//  - sprint start digest, and at sprint end: digest + roll unfinished issues into the next sprint
//  - daily burndown snapshots for active sprints
import { admin, appUrl, json, requireInternal, serve } from '../_shared/http.ts';
import { button, context, esc, getSlackInstall, postMessage, section, sendDm } from '../_shared/slack.ts';

interface Settings {
  team_id: string;
  timezone: string;
  reminder_hour: number;
  due_soon_dm: boolean;
  due_soon_days: number;
  overdue_dm: boolean;
  sprint_start_digest: boolean;
  sprint_end_digest: boolean;
}

interface Team {
  id: string;
  name: string;
  key: string;
  emoji: string;
  slack_channel_id: string | null;
  settings: Settings;
}

serve(async (req) => {
  requireInternal(req);
  const slackReady = !!(await getSlackInstall());
  const { data: teams, error } = await admin
    .from('teams')
    .select('id, name, key, emoji, slack_channel_id, settings:notification_settings(*)')
    .eq('archived', false);
  if (error) throw error;

  const report: Record<string, unknown> = {};
  for (const team of (teams ?? []) as unknown as Team[]) {
    try {
      report[team.key] = await tickTeam(team, slackReady);
    } catch (e) {
      console.error(`cron-tick ${team.key}:`, e);
      report[team.key] = { error: String(e) };
    }
  }
  return json(report);
});

function localNow(tz: string): { date: string; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Records a notification once. Returns false if it was already sent. */
async function claim(teamId: string, kind: string, key: string): Promise<boolean> {
  const { error } = await admin.from('notification_log').insert({ team_id: teamId, kind, dedupe_key: key });
  if (error?.code === '23505') return false;
  if (error) throw error;
  return true;
}

async function unclaim(key: string) {
  await admin.from('notification_log').delete().eq('dedupe_key', key);
}

/** Send once; if Slack fails, release the claim so the next tick retries. */
async function sendOnce(teamId: string, kind: string, key: string, send: () => Promise<unknown>) {
  if (!(await claim(teamId, kind, key))) return false;
  try {
    await send();
    return true;
  } catch (e) {
    await unclaim(key);
    throw e;
  }
}

async function tickTeam(team: Team, slackReady: boolean) {
  const s = team.settings;
  const { date: today, hour } = localNow(s.timezone);
  const isReminderHour = hour === s.reminder_hour;
  const out = { dms: 0, digests: 0, rolledOver: 0 };

  // ---- Due date DMs -------------------------------------------------------
  if (slackReady && isReminderHour && (s.due_soon_dm || s.overdue_dm)) {
    const { data: issues } = await admin
      .from('issues')
      .select('id, identifier, title, due_date, github_url, assignee:people!inner(name, slack_user_id), state:workflow_states!inner(category)')
      .eq('team_id', team.id)
      .not('due_date', 'is', null)
      .lte('due_date', addDays(today, s.due_soon_days))
      .not('assignee.slack_user_id', 'is', null)
      .not('state.category', 'in', '(completed,canceled)');

    // deno-lint-ignore no-explicit-any
    for (const i of (issues ?? []) as any[]) {
      const overdue = i.due_date < today;
      if (overdue ? !s.overdue_dm : !s.due_soon_dm) continue;
      const days = Math.round((Date.parse(i.due_date) - Date.parse(today)) / 86_400_000);
      const when = overdue
        ? `was due *${i.due_date}* and is overdue`
        : days === 0 ? 'is due *today*' : days === 1 ? 'is due *tomorrow*' : `is due in *${days} days* (${i.due_date})`;
      const emoji = overdue ? '🚨' : '⏰';
      const text = `${emoji} Hey ${esc(i.assignee.name)}! *${i.identifier}* ${esc(i.title)} ${when}.`;
      const blocks = [
        section(text),
        ...(i.github_url ? [button('Open on GitHub', i.github_url)] : []),
        context(`${team.emoji} ${esc(team.name)} · sent by Quadratic`),
      ];
      const kind = overdue ? 'overdue' : 'due_soon';
      if (await sendOnce(team.id, kind, `${kind}:${i.id}:${i.due_date}`, () => sendDm(i.assignee.slack_user_id, text, blocks))) {
        out.dms++;
      }
    }
  }

  // ---- Sprints ------------------------------------------------------------
  const { data: cycles } = await admin
    .from('cycles')
    .select('id, number, name, goal, starts_on, ends_on, completed_at')
    .eq('team_id', team.id)
    .order('starts_on');

  for (const c of cycles ?? []) {
    const active = c.starts_on <= today && today <= c.ends_on;
    if (active) await admin.rpc('snapshot_cycle', { p_cycle: c.id, p_day: today });

    // Start digest on the first day, at the reminder hour or later.
    if (slackReady && s.sprint_start_digest && team.slack_channel_id && c.starts_on === today && hour >= s.reminder_hour) {
      if (await sendOnce(team.id, 'cycle_start', `cycle_start:${c.id}`, () => postCycleStart(team, c))) out.digests++;
    }

    // Sprint over: digest, then roll unfinished work into the next sprint.
    if (!c.completed_at && c.ends_on < today) {
      const next = (cycles ?? []).find((n) => n.starts_on > c.ends_on);
      const stats = await cycleStats(c.id);
      const { data: moved } = await admin.rpc('rollover_cycle', { p_cycle: c.id, p_target: next?.id ?? null });
      out.rolledOver += moved ?? 0;
      if (slackReady && s.sprint_end_digest && team.slack_channel_id) {
        if (await sendOnce(team.id, 'cycle_end', `cycle_end:${c.id}`, () => postCycleEnd(team, c, stats, next))) {
          out.digests++;
        }
      }
    }
  }
  return out;
}

async function cycleStats(cycleId: string) {
  const { data } = await admin
    .from('issues')
    .select('estimate, assignee:people(name), state:workflow_states!inner(category)')
    .eq('cycle_id', cycleId);
  // deno-lint-ignore no-explicit-any
  const rows = (data ?? []) as any[];
  const live = rows.filter((r) => r.state.category !== 'canceled');
  const done = live.filter((r) => r.state.category === 'completed');
  const pts = (xs: typeof rows) => xs.reduce((n, r) => n + (r.estimate ?? 1), 0);
  return {
    total: live.length,
    done: done.length,
    carried: live.length - done.length,
    points: pts(live),
    donePoints: pts(done),
    owners: [...new Set(live.map((r) => r.assignee?.name).filter(Boolean))] as string[],
  };
}

type Cycle = { id: string; number: number; name: string | null; goal: string | null; starts_on: string; ends_on: string };
const cycleName = (c: Cycle) => c.name || `Sprint ${c.number}`;

async function postCycleStart(team: Team, c: Cycle) {
  const st = await cycleStats(c.id);
  const text = `🏁 *${esc(cycleName(c))}* starts today for ${team.emoji} *${esc(team.name)}*!`;
  await postMessage(team.slack_channel_id!, text, [
    section(text),
    ...(c.goal ? [section(`🎯 *Goal:* ${esc(c.goal)}`)] : []),
    section(`*${st.total}* issues · *${st.points}* points · ${c.starts_on} → ${c.ends_on}` +
      (st.owners.length ? `\n👩‍💻 ${st.owners.map(esc).join(', ')}` : '')),
    button('View sprint', appUrl(`/team/${team.key}/cycles/${c.id}`)),
  ]);
}

async function postCycleEnd(team: Team, c: Cycle, st: Awaited<ReturnType<typeof cycleStats>>, next?: Cycle) {
  const pct = st.total ? Math.round((st.done / st.total) * 100) : 0;
  const cheer = pct >= 90 ? '🎉 Crushed it!' : pct >= 60 ? '💪 Solid sprint.' : '🌱 Onward.';
  const text = `🏆 *${esc(cycleName(c))}* is wrapped for ${team.emoji} *${esc(team.name)}*. ${cheer}`;
  await postMessage(team.slack_channel_id!, text, [
    section(text),
    section(`✅ *${st.done}/${st.total}* issues done (${pct}%) · *${st.donePoints}/${st.points}* points` +
      (st.carried ? `\n↪️ ${st.carried} carried over to ${next ? `*${esc(cycleName(next))}*` : 'the backlog'}` : '')),
    button('Sprint report', appUrl(`/team/${team.key}/cycles/${c.id}`)),
  ]);
}
