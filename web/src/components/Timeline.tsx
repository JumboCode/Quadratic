import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, differenceInCalendarDays, eachMonthOfInterval, endOfMonth, format, max as maxDate, min as minDate, parseISO, startOfMonth } from 'date-fns';
import { CalendarPlus, Check } from 'lucide-react';
import { useDb } from '../lib/queries';
import type { CalendarEvent, Cycle, Milestone, Project, ProjectDependency, Team } from '../lib/types';
import { cn, cycleName, fmtDate } from '../lib/utils';
import { Button, Tabs } from './ui';

const ROW_H = 44;
const LABEL_W = 230;
const ZOOMS = { week: 18, month: 5, quarter: 2.2 } as const;
type Zoom = keyof typeof ZOOMS;

const EVENT_STYLE: Record<CalendarEvent['kind'], { bg: string; label: string; name: string }> = {
  break: { bg: 'rgba(148, 163, 184, 0.16)', label: '🏖️', name: 'Breaks' },
  finals: { bg: 'rgba(239, 68, 68, 0.10)', label: '📚', name: 'Finals' },
  event: { bg: 'rgba(46, 173, 91, 0.10)', label: '🎉', name: 'Events' },
  deadline: { bg: 'rgba(234, 179, 8, 0.14)', label: '⏰', name: 'Deadlines' },
};
const EVENT_KINDS = Object.keys(EVENT_STYLE) as CalendarEvent['kind'][];

// Which club-date kinds this viewer has hidden. Per-browser convenience only, so storage
// failures (private mode, blocked site data) just mean everything shows.
const HIDDEN_KEY = 'quadratic-timeline-hidden-kinds';
function loadHiddenKinds(): Set<CalendarEvent['kind']> {
  try {
    const raw = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((k) => EVENT_KINDS.includes(k)) : []);
  } catch {
    return new Set();
  }
}
function saveHiddenKinds(kinds: Set<CalendarEvent['kind']>) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...kinds]));
  } catch {
    // storage unavailable; the toggle still works for this visit
  }
}

interface Props {
  projects: Project[];
  progress: Map<string, number>;
  milestones: Milestone[];
  dependencies: ProjectDependency[];
  events: CalendarEvent[];
  cycles?: Cycle[];
  teams?: Team[];
}

interface Drag {
  id: string;
  mode: 'move' | 'start' | 'end';
  x0: number;
  start: string;
  end: string;
  delta: number;
}

export function Timeline({ projects, progress, milestones, dependencies, events, cycles = [], teams = [] }: Props) {
  const db = useDb([['projects'], ['project']]);
  const [zoom, setZoom] = useState<Zoom>('month');
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hiddenKinds, setHiddenKinds] = useState<Set<CalendarEvent['kind']>>(loadHiddenKinds);
  const shownEvents = useMemo(() => events.filter((e) => !hiddenKinds.has(e.kind)), [events, hiddenKinds]);
  const toggleKind = (k: CalendarEvent['kind']) => {
    const next = new Set(hiddenKinds);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    saveHiddenKinds(next);
    setHiddenKinds(next);
  };
  const scroller = useRef<HTMLDivElement>(null);
  const px = ZOOMS[zoom];

  const scheduled = projects.filter((p) => p.start_date || p.target_date);
  const unscheduled = projects.filter((p) => !p.start_date && !p.target_date);

  // Visible range: everything scheduled, padded, at least ~8 months around today.
  const range = useMemo(() => {
    const today = new Date();
    const dates: Date[] = [addDays(today, -45), addDays(today, 200)];
    scheduled.forEach((p) => {
      if (p.start_date) dates.push(parseISO(p.start_date));
      if (p.target_date) dates.push(parseISO(p.target_date));
    });
    events.forEach((e) => dates.push(parseISO(e.starts_on), parseISO(e.ends_on)));
    const start = startOfMonth(minDate(dates));
    const end = endOfMonth(maxDate(dates));
    return { start, end, days: differenceInCalendarDays(end, start) + 1 };
  }, [scheduled, events]);

  const x = (d: string | Date) => differenceInCalendarDays(typeof d === 'string' ? parseISO(d) : d, range.start) * px;
  const width = range.days * px;
  const months = eachMonthOfInterval({ start: range.start, end: range.end });
  const todayX = x(new Date());

  // Center on today the first time (and when zoom changes).
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, todayX - el.clientWidth / 3);
  }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dropped-but-not-yet-refetched dates, so bars don't snap back while saving.
  const [pending, setPending] = useState<Record<string, { start: string; end: string }>>({});
  useEffect(() => setPending({}), [projects]);

  const storedDates = (p: Project) => {
    if (pending[p.id]) return pending[p.id];
    const start = p.start_date ?? p.target_date!;
    return { start, end: p.target_date ?? addIso(start, 14) };
  };
  // Effective dates for a project, including an in-progress drag.
  const datesFor = (p: Project) => (drag?.id === p.id ? dragDates(drag) : storedDates(p));

  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => setDrag((d) => d && { ...d, delta: Math.round((e.clientX - d.x0) / px) });
    const onUp = () => {
      const d = dragRef.current;
      if (d && d.delta !== 0) {
        const { start, end } = dragDates(d);
        setPending((p) => ({ ...p, [d.id]: { start, end } }));
        db.mutate({ op: 'update', table: 'projects', match: { id: d.id }, values: { start_date: start, target_date: end } });
      }
      setDrag(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag?.id, px]); // eslint-disable-line react-hooks/exhaustive-deps

  const begin = (e: React.PointerEvent, p: Project, mode: Drag['mode']) => {
    e.preventDefault();
    e.stopPropagation();
    const { start, end } = datesFor(p);
    setDrag({ id: p.id, mode, x0: e.clientX, start, end, delta: 0 });
  };

  // Sort by saved dates so rows don't jump around mid-drag.
  const rows = [...scheduled].sort((a, b) => storedDates(a).start.localeCompare(storedDates(b).start));
  const rowIndex = new Map(rows.map((p, i) => [p.id, i]));
  const cycleLane = cycles.length > 0;
  const topOffset = cycleLane ? ROW_H : 0;
  const bodyH = topOffset + rows.length * ROW_H;

  const schedule = (p: Project) => {
    const s = format(new Date(), 'yyyy-MM-dd');
    db.mutate({ op: 'update', table: 'projects', match: { id: p.id }, values: { start_date: s, target_date: addIso(s, 42) } });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs<Zoom> value={zoom} onChange={setZoom} tabs={[{ value: 'week', label: 'Weeks' }, { value: 'month', label: 'Months' }, { value: 'quarter', label: 'Year' }]} />
        <div className="flex flex-wrap items-center gap-1.5 text-xs" role="group" aria-label="Show club dates">
          <span className="mr-0.5 text-muted">Show:</span>
          {EVENT_KINDS.map((k) => {
            const on = !hiddenKinds.has(k);
            const count = events.filter((e) => e.kind === k).length;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => toggleKind(k)}
                title={`${on ? 'Hide' : 'Show'} ${EVENT_STYLE[k].name.toLowerCase()} on the timeline`}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium transition',
                  on ? 'border-line bg-surface text-ink hover:border-brand-300' : 'border-dashed border-line text-muted opacity-60 hover:opacity-100',
                )}
              >
                <span
                  className="flex size-3.5 items-center justify-center rounded-[4px] border border-line"
                  style={{ background: on ? EVENT_STYLE[k].bg : 'transparent' }}
                >
                  {on && <Check className="size-2.5 text-ink" strokeWidth={3} />}
                </span>
                {EVENT_STYLE[k].label} {EVENT_STYLE[k].name}
                <span className="tabular-nums text-muted">{count}</span>
              </button>
            );
          })}
        </div>
        <span className="ml-auto text-xs text-muted">Drag bars to reschedule · drag edges to resize</span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex">
          {/* labels */}
          <div className="shrink-0 border-r border-line" style={{ width: LABEL_W }}>
            <div className="h-12 border-b border-line" />
            {cycleLane && <div className="flex items-center border-b border-line/60 px-3 text-xs font-medium text-muted" style={{ height: ROW_H }}>Sprints</div>}
            {rows.map((p) => (
              <Link
                key={p.id}
                to={`/projects/${p.id}`}
                className="flex items-center gap-2 border-b border-line/60 px-3 text-sm hover:bg-surface-2"
                style={{ height: ROW_H }}
              >
                <span>{p.emoji}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                <span className="text-xs">
                  {teams.filter((t) => p.project_teams?.some((pt) => pt.team_id === t.id)).map((t) => t.emoji).join('')}
                </span>
              </Link>
            ))}
          </div>

          {/* chart */}
          <div ref={scroller} className="relative min-w-0 flex-1 overflow-x-auto">
            <div className="relative" style={{ width, height: 48 + bodyH }}>
              {/* month header */}
              <div className="sticky top-0 z-10 h-12 border-b border-line bg-surface">
                {months.map((m) => (
                  <div key={m.toISOString()} className="absolute top-0 h-full border-l border-line/70 px-2 pt-1.5" style={{ left: x(m), width: x(endOfMonth(m)) - x(m) + px }}>
                    <div className="text-xs font-semibold">{format(m, zoom === 'quarter' ? 'MMM' : 'MMMM')}</div>
                    <div className="text-[10px] text-muted">{format(m, 'yyyy')}</div>
                  </div>
                ))}
              </div>

              {/* calendar bands */}
              {shownEvents.map((e) => (
                <div
                  key={e.id}
                  className="absolute top-12 border-x border-dashed border-line/60"
                  style={{ left: x(e.starts_on), width: Math.max(px, x(e.ends_on) - x(e.starts_on) + px), height: bodyH, background: EVENT_STYLE[e.kind].bg }}
                  title={`${e.title} (${fmtDate(e.starts_on)}–${fmtDate(e.ends_on)})`}
                >
                  <span className="absolute left-1 top-1 whitespace-nowrap text-[10px] font-medium text-muted">{EVENT_STYLE[e.kind].label} {e.title}</span>
                </div>
              ))}

              {/* grid lines */}
              {months.map((m) => (
                <div key={`g${m.toISOString()}`} className="absolute top-12 border-l border-line/50" style={{ left: x(m), height: bodyH }} />
              ))}
              {rows.map((p, i) => (
                <div key={`r${p.id}`} className="absolute left-0 border-b border-line/40" style={{ top: 48 + topOffset + (i + 1) * ROW_H - 1, width }} />
              ))}

              {/* today */}
              <div className="absolute top-12 z-20 w-0.5 bg-brand-500" style={{ left: todayX, height: bodyH }}>
                <span className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full rounded-full bg-brand-500 px-1.5 py-px text-[10px] font-bold text-white">Today</span>
              </div>

              {/* sprints lane */}
              {cycles.map((c) => (
                <div
                  key={c.id}
                  className="absolute flex items-center overflow-hidden rounded-lg border border-brand-300/60 bg-brand-500/10 px-2 text-[11px] font-medium text-brand-700 dark:text-brand-300"
                  style={{ top: 48 + 8, height: ROW_H - 16, left: x(c.starts_on) + 1, width: x(c.ends_on) - x(c.starts_on) + px - 2 }}
                  title={`${cycleName(c)}: ${fmtDate(c.starts_on)}–${fmtDate(c.ends_on)}`}
                >
                  <span className="truncate">{cycleName(c)}</span>
                </div>
              ))}

              {/* dependency arrows */}
              <svg className="pointer-events-none absolute left-0 top-12 z-10 overflow-visible" width={width} height={bodyH}>
                <defs>
                  <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M0,0 L8,4 L0,8 z" fill="var(--muted)" />
                  </marker>
                  <marker id="arrow-bad" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M0,0 L8,4 L0,8 z" fill="#ef4444" />
                  </marker>
                </defs>
                {dependencies.map((d) => {
                  const a = rows[rowIndex.get(d.blocking_project_id) ?? -1];
                  const b = rows[rowIndex.get(d.blocked_project_id) ?? -1];
                  if (!a || !b) return null;
                  const ad = datesFor(a);
                  const bd = datesFor(b);
                  const x1 = x(ad.end) + px;
                  const y1 = topOffset + rowIndex.get(a.id)! * ROW_H + ROW_H / 2;
                  const x2 = x(bd.start);
                  const y2 = topOffset + rowIndex.get(b.id)! * ROW_H + ROW_H / 2;
                  const conflict = ad.end >= bd.start;
                  const bend = Math.max(24, Math.abs(x2 - x1) / 2);
                  return (
                    <path
                      key={`${d.blocking_project_id}-${d.blocked_project_id}`}
                      d={`M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2 - 2},${y2}`}
                      fill="none"
                      stroke={conflict ? '#ef4444' : 'var(--muted)'}
                      strokeWidth={1.5}
                      strokeDasharray={conflict ? '4 3' : undefined}
                      markerEnd={`url(#${conflict ? 'arrow-bad' : 'arrow'})`}
                    >
                      <title>{conflict ? `⚠️ ${b.name} starts before ${a.name} is done` : `${a.name} blocks ${b.name}`}</title>
                    </path>
                  );
                })}
              </svg>

              {/* project bars */}
              {rows.map((p, i) => {
                const { start, end } = datesFor(p);
                const left = x(start);
                const w = Math.max(px * 2, x(end) - left + px);
                const pct = progress.get(p.id) ?? 0;
                const top = 48 + topOffset + i * ROW_H + 8;
                const dragging = drag?.id === p.id;
                return (
                  <div key={p.id}>
                    <div
                      onPointerDown={(e) => begin(e, p, 'move')}
                      className={cn(
                        'group absolute z-10 flex cursor-grab touch-none select-none items-center overflow-hidden rounded-lg border text-xs font-medium shadow-sm transition-shadow active:cursor-grabbing',
                        dragging ? 'shadow-lg ring-2 ring-brand-400' : 'hover:shadow-md',
                        !p.target_date && 'border-dashed',
                      )}
                      style={{ left, width: w, top, height: ROW_H - 16, borderColor: `${p.color}88`, background: `${p.color}1f` }}
                      title={`${p.name}: ${fmtDate(start)} → ${fmtDate(end)} · ${pct}% done`}
                    >
                      <div className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: `${p.color}55` }} />
                      <span className="relative truncate px-2">{p.emoji} {p.name} <span className="opacity-60">{pct}%</span></span>
                      <span onPointerDown={(e) => begin(e, p, 'start')} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize opacity-0 group-hover:bg-black/10 group-hover:opacity-100" />
                      <span onPointerDown={(e) => begin(e, p, 'end')} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize opacity-0 group-hover:bg-black/10 group-hover:opacity-100" />
                    </div>
                    {dragging && (
                      <div className="absolute z-30 rounded-md bg-ink px-1.5 py-0.5 text-[10px] text-bg" style={{ left, top: top - 20 }}>
                        {fmtDate(start)} → {fmtDate(end)}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* milestones */}
              {milestones.map((m) => {
                const i = rowIndex.get(m.project_id);
                if (i == null || !m.target_date) return null;
                return (
                  <div
                    key={m.id}
                    className="absolute z-20 size-3 rotate-45 border-2 border-surface bg-ink"
                    style={{ left: x(m.target_date) + px / 2 - 6, top: 48 + topOffset + i * ROW_H + ROW_H / 2 - 6 }}
                    title={`◆ ${m.name} · ${fmtDate(m.target_date)}`}
                  />
                );
              })}
            </div>
          </div>
        </div>
        {rows.length === 0 && !cycleLane && <div className="border-t border-line p-8 text-center text-sm text-muted">No scheduled projects yet.</div>}
      </div>

      {unscheduled.length > 0 && (
        <div className="rounded-2xl border border-dashed border-line p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Unscheduled</div>
          <div className="flex flex-wrap gap-2">
            {unscheduled.map((p) => (
              <span key={p.id} className="flex items-center gap-2 rounded-xl border border-line bg-surface py-1 pl-3 pr-1 text-sm">
                <Link to={`/projects/${p.id}`} className="hover:underline">{p.emoji} {p.name}</Link>
                <Button size="sm" variant="ghost" onClick={() => schedule(p)} icon={<CalendarPlus className="size-3.5" />}>Schedule</Button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function dragDates(d: Drag) {
  let start = d.mode !== 'end' ? addIso(d.start, d.delta) : d.start;
  const end = d.mode !== 'start' ? addIso(d.end, d.delta) : d.end;
  if (start > end) start = end;
  return { start, end };
}

function addIso(d: string, n: number) {
  return format(addDays(parseISO(d), n), 'yyyy-MM-dd');
}
