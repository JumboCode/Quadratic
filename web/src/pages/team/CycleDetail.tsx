import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { eachDayOfInterval, format, parseISO } from 'date-fns';
import confetti from 'canvas-confetti';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Flag, Plus, Trophy } from 'lucide-react';
import { useDb, useIssues, useSnapshots, useUpdateIssue } from '../../lib/queries';
import { supabase, unwrap } from '../../lib/supabase';
import { cycleName, fmtDate, todayISO } from '../../lib/utils';
import { Button, Card, Empty, Input, PageLoader, Progress } from '../../components/ui';
import { BurndownChart } from '../../components/Charts';
import { byPriority, IssueList } from '../../components/issue/IssueViews';
import { useTeamCtx } from './TeamLayout';

export function CycleDetail() {
  const { cycleId } = useParams();
  const { team, bundle } = useTeamCtx();
  const qc = useQueryClient();
  const cycle = bundle.cycles.find((c) => c.id === cycleId);
  const { data: issues = [], isLoading } = useIssues({ teamId: team.id });
  const { data: snapshots = [] } = useSnapshots(cycleId ? [cycleId] : []);
  const update = useUpdateIssue();
  const db = useDb([['cycles', team.id]]);
  const [goal, setGoal] = useState<string | null>(null);
  const today = todayISO();

  const inCycle = useMemo(() => issues.filter((i) => i.cycle_id === cycleId), [issues, cycleId]);
  const backlog = useMemo(
    () =>
      issues
        .filter((i) => !i.cycle_id && !['completed', 'canceled'].includes(bundle.stateById.get(i.state_id)?.category ?? ''))
        .sort(byPriority),
    [issues, bundle],
  );

  if (isLoading || bundle.loading) return <PageLoader />;
  if (!cycle) return <Empty title="Sprint not found" />;

  const live = inCycle.filter((i) => bundle.stateById.get(i.state_id)?.category !== 'canceled');
  const done = live.filter((i) => bundle.stateById.get(i.state_id)?.category === 'completed');
  const pts = (xs: typeof live) => xs.reduce((n, i) => n + (i.estimate ?? 1), 0);
  const scope = pts(live);
  const pct = live.length ? Math.round((done.length / live.length) * 100) : 0;
  const isOver = cycle.ends_on < today;

  // Burndown: snapshots per day, with today's live numbers, against a straight ideal line.
  const days = eachDayOfInterval({ start: parseISO(cycle.starts_on), end: parseISO(cycle.ends_on) }).map((d) => format(d, 'yyyy-MM-dd'));
  const snapByDay = new Map(snapshots.map((s) => [s.day, s]));
  const startScope = snapshots[0]?.scope_points ?? scope;
  const burndown = days.map((day, idx) => {
    const s = snapByDay.get(day);
    const remaining = day === today ? scope - pts(done) : s ? s.scope_points - s.completed_points : null;
    return {
      day: format(parseISO(day), 'MMM d'),
      remaining: day > today ? null : remaining,
      ideal: Math.round((startScope * (1 - idx / Math.max(1, days.length - 1))) * 10) / 10,
    };
  });

  const next = bundle.cycles.filter((c) => c.starts_on > cycle.ends_on).sort((a, b) => a.starts_on.localeCompare(b.starts_on))[0];

  const complete = async () => {
    const moved = unwrap(await supabase.rpc('rollover_cycle', { p_cycle: cycle.id, p_target: next?.id ?? null })) as number;
    qc.invalidateQueries({ queryKey: ['cycles', team.id] });
    qc.invalidateQueries({ queryKey: ['issues'] });
    confetti({ particleCount: 160, spread: 100, origin: { y: 0.4 }, colors: ['#2ead5b', '#7fdea5', '#b3edc8', '#ffd166', '#5b6fd6'] });
    toast.success(`${cycleName(cycle)} complete! 🎉`, {
      description: moved ? `${moved} unfinished issue${moved > 1 ? 's' : ''} moved to ${next ? cycleName(next) : 'the backlog'}.` : 'Everything got done!',
    });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <Link to=".." relative="path" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> All sprints
      </Link>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-bold">{cycleName(cycle)}</h2>
          <div className="text-sm text-muted">
            {fmtDate(cycle.starts_on, 'EEE MMM d')} → {fmtDate(cycle.ends_on, 'EEE MMM d, yyyy')}
            {cycle.completed_at && ' · Completed'}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Flag className="size-4 text-brand-500" />
            <Input
              value={goal ?? cycle.goal ?? ''}
              onChange={(e) => setGoal(e.target.value)}
              onBlur={() => goal !== null && db.mutate({ op: 'update', table: 'cycles', match: { id: cycle.id }, values: { goal } })}
              placeholder="Set a sprint goal…"
              className="h-8 max-w-md border-transparent bg-transparent px-1 hover:border-line"
            />
          </div>
        </div>
        {!cycle.completed_at && (
          <Button variant={isOver ? 'primary' : 'secondary'} onClick={complete} icon={<Trophy className="size-4" />}>
            Complete sprint
          </Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs font-medium text-muted">Progress</div>
          <div className="mt-1 font-display text-4xl font-bold tabular-nums">{pct}%</div>
          <Progress value={pct} className="mt-3" />
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <Stat label="Issues" value={`${done.length}/${live.length}`} />
            <Stat label="Points" value={`${pts(done)}/${scope}`} />
            <Stat label="Days left" value={isOver ? '0' : String(Math.max(0, days.filter((d) => d >= today).length))} />
          </div>
        </Card>
        <Card className="p-4 lg:col-span-2">
          <div className="mb-1 text-sm font-semibold">Burndown</div>
          <BurndownChart data={burndown} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="border-b border-line px-4 py-2.5 text-sm font-semibold">In this sprint</div>
          <IssueList issues={inCycle} bundle={bundle} emptyText="Nothing planned yet. Add issues from the backlog →" />
        </Card>
        <Card className="overflow-hidden">
          <div className="border-b border-line px-4 py-2.5 text-sm font-semibold">
            Backlog <span className="font-normal text-muted">{backlog.length}</span>
          </div>
          <div className="max-h-[32rem] overflow-y-auto">
            {backlog.length === 0 && <div className="p-6 text-center text-sm text-muted">Backlog is empty 🎉</div>}
            {backlog.map((i) => (
              <div key={i.id} className="flex items-center gap-2 border-b border-line/70 px-3 py-2 text-sm">
                <span className="w-14 shrink-0 font-mono text-xs text-muted">{i.identifier}</span>
                <span className="min-w-0 flex-1 truncate">{i.title}</span>
                <button
                  onClick={() => update.mutate({ id: i.id, patch: { cycle_id: cycle.id } })}
                  className="rounded-lg p-1 text-brand-600 hover:bg-brand-500/10"
                  aria-label={`Add ${i.identifier} to sprint`}
                  title="Add to sprint"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 py-2">
      <div className="font-semibold tabular-nums">{value}</div>
      <div className="text-muted">{label}</div>
    </div>
  );
}
