import { useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, format, nextMonday, parseISO } from 'date-fns';
import { CalendarPlus, Plus } from 'lucide-react';
import { useDb, useIssues } from '../../lib/queries';
import type { Cycle } from '../../lib/types';
import { cn, cycleName, fmtDate, todayISO } from '../../lib/utils';
import { Badge, Button, Card, Empty, Field, Input, Modal, PageLoader, Progress, Select } from '../../components/ui';
import { VelocityChart } from '../../components/Charts';
import { useTeamCtx } from './TeamLayout';

export function Cycles() {
  const { team, bundle } = useTeamCtx();
  const { data: issues = [], isLoading } = useIssues({ teamId: team.id });
  const [creating, setCreating] = useState(false);
  const today = todayISO();

  if (isLoading || bundle.loading) return <PageLoader />;

  const stats = (c: Cycle) => {
    const mine = issues.filter((i) => i.cycle_id === c.id && bundle.stateById.get(i.state_id)?.category !== 'canceled');
    const done = mine.filter((i) => bundle.stateById.get(i.state_id)?.category === 'completed');
    const pts = (xs: typeof mine) => xs.reduce((n, i) => n + (i.estimate ?? 1), 0);
    return { total: mine.length, done: done.length, points: pts(mine), donePoints: pts(done) };
  };

  const cycles = [...bundle.cycles].sort((a, b) => b.starts_on.localeCompare(a.starts_on));
  const current = cycles.filter((c) => c.starts_on <= today && today <= c.ends_on);
  const upcoming = cycles.filter((c) => c.starts_on > today).reverse();
  const past = cycles.filter((c) => c.ends_on < today);
  const velocity = [...past].reverse().slice(-8).map((c) => ({ name: `S${c.number}`, points: stats(c).donePoints }));

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">Sprints</h2>
          <p className="text-sm text-muted">Time-boxed chunks of work. Unfinished issues roll into the next sprint automatically.</p>
        </div>
        <Button variant="primary" className="ml-auto" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
          Plan sprints
        </Button>
      </div>

      {cycles.length === 0 ? (
        <Empty title="No sprints yet" action={<Button variant="primary" onClick={() => setCreating(true)}>Plan your first sprints</Button>}>
          Most JumboCode teams run two-week sprints. You can plan the whole semester in one go.
        </Empty>
      ) : (
        <>
          {[
            { title: 'Current', list: current },
            { title: 'Upcoming', list: upcoming },
            { title: 'Past', list: past },
          ].map(
            (g) =>
              g.list.length > 0 && (
                <section key={g.title}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{g.title}</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {g.list.map((c) => {
                      const s = stats(c);
                      const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
                      return (
                        <Link key={c.id} to={`/team/${team.key}/cycles/${c.id}`}>
                          <Card className={cn('p-4 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md', g.title === 'Current' && 'border-brand-300 ring-2 ring-brand-500/15')}>
                            <div className="flex items-center gap-2">
                              <span className="font-display font-bold">{cycleName(c)}</span>
                              {g.title === 'Current' && <Badge color="#2ead5b">Active</Badge>}
                              <span className="ml-auto text-xs text-muted">{fmtDate(c.starts_on)} – {fmtDate(c.ends_on)}</span>
                            </div>
                            {c.goal && <p className="mt-1 line-clamp-1 text-sm text-muted">🎯 {c.goal}</p>}
                            <div className="mt-3 flex items-center gap-3 text-xs text-muted">
                              <Progress value={pct} className="flex-1" />
                              <span className="tabular-nums">{s.done}/{s.total} · {pct}%</span>
                            </div>
                          </Card>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ),
          )}
          {velocity.length > 1 && (
            <Card className="p-4">
              <h3 className="font-semibold">Velocity</h3>
              <p className="mb-3 text-xs text-muted">Points completed per sprint (unestimated issues count as 1)</p>
              <VelocityChart data={velocity} />
            </Card>
          )}
        </>
      )}

      <PlanSprintsModal open={creating} onClose={() => setCreating(false)} teamId={team.id} cycles={bundle.cycles} />
    </div>
  );
}

function PlanSprintsModal({ open, onClose, teamId, cycles }: { open: boolean; onClose: () => void; teamId: string; cycles: Cycle[] }) {
  const last = [...cycles].sort((a, b) => b.ends_on.localeCompare(a.ends_on))[0];
  const defaultStart = last ? format(addDays(parseISO(last.ends_on), 1), 'yyyy-MM-dd') : format(nextMonday(new Date()), 'yyyy-MM-dd');
  const [start, setStart] = useState(defaultStart);
  const [weeks, setWeeks] = useState(2);
  const [count, setCount] = useState(1);
  const [goal, setGoal] = useState('');
  const db = useDb([['cycles', teamId]], 'Sprints planned 🗓️');
  const nextNumber = Math.max(0, ...cycles.map((c) => c.number)) + 1;

  const preview = Array.from({ length: count }, (_, i) => {
    const s = addDays(parseISO(start), i * weeks * 7);
    return { number: nextNumber + i, starts_on: format(s, 'yyyy-MM-dd'), ends_on: format(addDays(s, weeks * 7 - 1), 'yyyy-MM-dd') };
  });

  const submit = async () => {
    await db.mutateAsync({
      op: 'insert',
      table: 'cycles',
      values: preview.map((p, i) => ({ team_id: teamId, ...p, goal: i === 0 && goal ? goal : null })),
    });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Plan sprints">
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-3 gap-3">
          <Field label="First sprint starts">
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Length">
            <Select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className="w-full">
              {[1, 2, 3, 4].map((w) => <option key={w} value={w}>{w} week{w > 1 ? 's' : ''}</option>)}
            </Select>
          </Field>
          <Field label="How many">
            <Select value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full">
              {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12].map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Goal for the first sprint (optional)">
          <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Ship the login flow" />
        </Field>
        <div className="rounded-xl bg-surface-2 p-3 text-sm">
          {preview.map((p) => (
            <div key={p.number} className="flex justify-between py-0.5">
              <span className="font-medium">Sprint {p.number}</span>
              <span className="text-muted">{fmtDate(p.starts_on, 'EEE MMM d')} → {fmtDate(p.ends_on, 'EEE MMM d')}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} loading={db.isPending} icon={<CalendarPlus className="size-4" />}>
          Create {count > 1 ? `${count} sprints` : 'sprint'}
        </Button>
      </div>
    </Modal>
  );
}
