import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { ChevronDown, Filter, Github, Plus, Search, X } from 'lucide-react';
import type { Issue, WorkflowState } from '../../lib/types';
import type { TeamBundle } from '../../lib/team-bundle';
import { useUpdateIssue } from '../../lib/queries';
import { useUI } from '../../lib/ui-context';
import { cn, cycleName, dueLabel, PRIORITIES, STATE_ORDER } from '../../lib/utils';
import { StateIcon } from '../icons';
import { Avatar, Picker } from '../ui';
import { AssigneePicker, PriorityPicker, StatePicker } from './pickers';

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface Filters {
  q: string;
  assignees: string[];
  labels: string[];
  priorities: string[];
  showClosed: boolean;
}

export const emptyFilters: Filters = { q: '', assignees: [], labels: [], priorities: [], showClosed: false };

export function applyFilters(issues: Issue[], f: Filters, b: TeamBundle): Issue[] {
  const q = f.q.trim().toLowerCase();
  return issues.filter((i) => {
    const cat = b.stateById.get(i.state_id)?.category;
    if (!f.showClosed && cat === 'canceled') return false;
    if (q && !i.title.toLowerCase().includes(q) && !i.identifier.toLowerCase().includes(q)) return false;
    if (f.assignees.length && !f.assignees.includes(i.assignee_id ?? 'none')) return false;
    if (f.priorities.length && !f.priorities.includes(String(i.priority))) return false;
    if (f.labels.length && !i.issue_labels?.some((l) => f.labels.includes(l.label_id))) return false;
    return true;
  });
}

/** Urgent → low, then "no priority", then newest first. */
export const byPriority = (a: Issue, b: Issue) =>
  (a.priority || 9) - (b.priority || 9) || b.sort_order - a.sort_order;

export function FilterBar({ filters, setFilters, bundle, right }: { filters: Filters; setFilters: (f: Filters) => void; bundle: TeamBundle; right?: ReactNode }) {
  const set = (patch: Partial<Filters>) => setFilters({ ...filters, ...patch });
  const active = filters.assignees.length + filters.labels.length + filters.priorities.length;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
        <input
          value={filters.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Filter issues…"
          className="h-8 w-48 rounded-lg border border-line bg-surface pl-8 pr-2 text-[13px] outline-none focus:border-brand-400"
        />
      </div>
      <FilterPicker
        label="Assignee"
        value={filters.assignees}
        onChange={(v) => set({ assignees: v })}
        options={[{ value: 'none', label: 'Unassigned' }, ...bundle.people.map((p) => ({ value: p.id, label: p.name }))]}
      />
      <FilterPicker
        label="Label"
        value={filters.labels}
        onChange={(v) => set({ labels: v })}
        options={bundle.labels.map((l) => ({ value: l.id, label: l.name }))}
      />
      <FilterPicker
        label="Priority"
        value={filters.priorities}
        onChange={(v) => set({ priorities: v })}
        options={PRIORITIES.map((p) => ({ value: String(p.value), label: p.label }))}
      />
      <label className="flex items-center gap-1.5 text-[13px] text-muted">
        <input type="checkbox" checked={filters.showClosed} onChange={(e) => set({ showClosed: e.target.checked })} className="accent-brand-500" />
        Show canceled
      </label>
      {active > 0 && (
        <button onClick={() => setFilters({ ...emptyFilters, q: filters.q })} className="flex items-center gap-1 text-[13px] text-muted hover:text-ink">
          <X className="size-3.5" /> Clear
        </button>
      )}
      <div className="ml-auto flex items-center gap-2">{right}</div>
    </div>
  );
}

function FilterPicker({ label, value, onChange, options }: { label: string; value: string[]; onChange: (v: string[]) => void; options: { value: string; label: string }[] }) {
  return (
    <Picker
      multiple
      value={value}
      onChange={(_v, all) => onChange(all ?? [])}
      options={options}
      trigger={
        <span
          className={cn(
            'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-[13px]',
            value.length ? 'border-brand-400 bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'border-line bg-surface text-muted',
          )}
        >
          <Filter className="size-3" /> {label}
          {value.length > 0 && <span className="font-semibold">· {value.length}</span>}
          <ChevronDown className="size-3" />
        </span>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Rows & cards
// ---------------------------------------------------------------------------

export function useOpenIssue() {
  const [params, setParams] = useSearchParams();
  return {
    openId: params.get('issue'),
    open: (identifier: string) => setParams((p) => { p.set('issue', identifier); return p; }),
    close: () => setParams((p) => { p.delete('issue'); return p; }),
  };
}

function LabelDots({ issue, bundle }: { issue: Issue; bundle: TeamBundle }) {
  const labels = (issue.issue_labels ?? []).map((l) => bundle.labelById.get(l.label_id)).filter(Boolean);
  if (!labels.length) return null;
  return (
    <span className="hidden items-center gap-1 sm:flex">
      {labels.slice(0, 3).map((l) => (
        <span key={l!.id} className="inline-flex items-center gap-1 rounded-full border border-line px-1.5 py-px text-[11px] text-muted">
          <span className="size-1.5 rounded-full" style={{ background: l!.color }} />
          {l!.name}
        </span>
      ))}
    </span>
  );
}

function DueChip({ date }: { date: string | null }) {
  if (!date) return null;
  const d = dueLabel(date);
  return (
    <span
      className={cn(
        'rounded-md px-1.5 py-px text-[11px] font-medium',
        d.tone === 'late' ? 'bg-red-500/12 text-red-600' : d.tone === 'soon' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'text-muted',
      )}
    >
      {d.text}
    </span>
  );
}

export function IssueRow({ issue, bundle, showCycle = true }: { issue: Issue; bundle: TeamBundle; showCycle?: boolean }) {
  const update = useUpdateIssue();
  const { open } = useOpenIssue();
  const cycle = issue.cycle_id ? bundle.cycleById.get(issue.cycle_id) : null;
  const project = issue.project_id ? bundle.projectById.get(issue.project_id) : null;
  const closed = ['completed', 'canceled'].includes(bundle.stateById.get(issue.state_id)?.category ?? '');

  return (
    <div
      onClick={() => open(issue.identifier)}
      className="group flex cursor-pointer items-center gap-2.5 border-b border-line/70 px-4 py-2 text-sm transition hover:bg-surface-2/70"
    >
      <span onClick={(e) => e.stopPropagation()}>
        <PriorityPicker compact value={issue.priority} onChange={(priority) => update.mutate({ id: issue.id, patch: { priority } })} />
      </span>
      <span className="w-16 shrink-0 font-mono text-xs text-muted">{issue.identifier}</span>
      <span onClick={(e) => e.stopPropagation()}>
        <StatePicker compact states={bundle.states} value={issue.state_id} onChange={(state_id) => update.mutate({ id: issue.id, patch: { state_id } })} />
      </span>
      <span className={cn('min-w-0 flex-1 truncate', closed && 'text-muted line-through decoration-1')}>{issue.title}</span>
      <LabelDots issue={issue} bundle={bundle} />
      {project && <span className="hidden max-w-32 truncate text-xs text-muted lg:inline">{project.emoji} {project.name}</span>}
      {showCycle && cycle && <span className="hidden text-xs text-muted md:inline">{cycleName(cycle)}</span>}
      <DueChip date={issue.due_date} />
      {issue.github_url && <Github className="size-3.5 text-muted" aria-label="Synced to GitHub" />}
      <span onClick={(e) => e.stopPropagation()}>
        <AssigneePicker compact people={bundle.people} value={issue.assignee_id} onChange={(assignee_id) => update.mutate({ id: issue.id, patch: { assignee_id } })} align="right" />
      </span>
    </div>
  );
}

export function IssueList({
  issues, bundle, groupBy = 'state', emptyText = 'No issues here.', teamId,
}: { issues: Issue[]; bundle: TeamBundle; groupBy?: 'state' | 'assignee' | 'none'; emptyText?: string; teamId?: string }) {
  const ui = useUI();
  const groups = useMemo(() => {
    const sorted = [...issues].sort(byPriority);
    if (groupBy === 'none') return [{ key: 'all', title: null as ReactNode, items: sorted, stateId: undefined as string | undefined }];
    if (groupBy === 'assignee') {
      const m = new Map<string, Issue[]>();
      sorted.forEach((i) => m.set(i.assignee_id ?? 'none', [...(m.get(i.assignee_id ?? 'none') ?? []), i]));
      return [...m.entries()].map(([k, items]) => {
        const p = bundle.personById.get(k);
        return {
          key: k,
          stateId: undefined,
          title: (
            <span className="flex items-center gap-2">
              <Avatar name={p?.name ?? 'Unassigned'} size={18} /> {p?.name ?? 'Unassigned'}
            </span>
          ),
          items,
        };
      });
    }
    const states = [...bundle.states].sort(
      (a, b) => STATE_ORDER.indexOf(a.category) - STATE_ORDER.indexOf(b.category) || a.position - b.position,
    );
    return states
      .map((s) => ({
        key: s.id,
        stateId: s.id,
        title: (
          <span className="flex items-center gap-2">
            <StateIcon category={s.category} color={s.color} /> {s.name}
          </span>
        ),
        items: sorted.filter((i) => i.state_id === s.id),
      }))
      .filter((g) => g.items.length > 0);
  }, [issues, bundle, groupBy]);

  if (!issues.length) return <div className="px-4 py-10 text-center text-sm text-muted">{emptyText}</div>;

  return (
    <div>
      {groups.map((g) => (
        <div key={g.key}>
          {g.title && (
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface-2/90 px-4 py-1.5 text-[13px] font-medium backdrop-blur">
              {g.title}
              <span className="text-muted">{g.items.length}</span>
              {teamId && g.stateId && (
                <button
                  onClick={() => ui.openCreateIssue({ team_id: teamId, state_id: g.stateId })}
                  className="ml-auto rounded p-0.5 text-muted hover:bg-surface hover:text-ink"
                  aria-label="Add issue"
                >
                  <Plus className="size-3.5" />
                </button>
              )}
            </div>
          )}
          {g.items.map((i) => <IssueRow key={i.id} issue={i} bundle={bundle} />)}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kanban board
// ---------------------------------------------------------------------------

function IssueCard({ issue, bundle, overlay }: { issue: Issue; bundle: TeamBundle; overlay?: boolean }) {
  const person = issue.assignee_id ? bundle.personById.get(issue.assignee_id) : null;
  const cycle = issue.cycle_id ? bundle.cycleById.get(issue.cycle_id) : null;
  return (
    <div
      className={cn(
        'rounded-xl border border-line bg-surface p-3 text-sm shadow-sm transition',
        overlay ? 'rotate-2 scale-105 shadow-xl ring-2 ring-brand-400' : 'hover:border-brand-300 hover:shadow-md',
      )}
    >
      <div className="mb-1.5 flex items-center gap-2 text-xs text-muted">
        <span className="font-mono">{issue.identifier}</span>
        {issue.github_url && <Github className="size-3" />}
        <span className="ml-auto">{person ? <Avatar name={person.name} size={20} /> : null}</span>
      </div>
      <div className="mb-2 line-clamp-3 font-medium leading-snug">{issue.title}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {issue.priority > 0 && (
          <span className="rounded-md border border-line px-1.5 py-px text-[11px] text-muted">{PRIORITIES[issue.priority].short}</span>
        )}
        {issue.estimate != null && <span className="rounded-md border border-line px-1.5 py-px text-[11px] text-muted">△ {issue.estimate}</span>}
        <DueChip date={issue.due_date} />
        {cycle && <span className="text-[11px] text-muted">{cycleName(cycle)}</span>}
        <LabelDots issue={issue} bundle={bundle} />
      </div>
    </div>
  );
}

function DraggableCard({ issue, bundle }: { issue: Issue; bundle: TeamBundle }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: issue.id });
  const { open } = useOpenIssue();
  return (
    <motion.div
      layout
      layoutId={issue.id}
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => open(issue.identifier)}
      className={cn('cursor-grab touch-none active:cursor-grabbing', isDragging && 'opacity-30')}
    >
      <IssueCard issue={issue} bundle={bundle} />
    </motion.div>
  );
}

function Column({ state, issues, bundle, teamId }: { state: WorkflowState; issues: Issue[]; bundle: TeamBundle; teamId: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: state.id });
  const ui = useUI();
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1 text-[13px] font-semibold">
        <StateIcon category={state.category} color={state.color} />
        {state.name}
        <span className="font-normal text-muted">{issues.length}</span>
        <button
          onClick={() => ui.openCreateIssue({ team_id: teamId, state_id: state.id })}
          className="ml-auto rounded-md p-0.5 text-muted hover:bg-surface-2 hover:text-ink"
          aria-label={`Add issue to ${state.name}`}
        >
          <Plus className="size-4" />
        </button>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-32 flex-1 flex-col gap-2 rounded-2xl p-1.5 transition',
          isOver ? 'bg-brand-500/10 ring-2 ring-brand-400/50' : 'bg-surface-2/50',
        )}
      >
        {issues.map((i) => <DraggableCard key={i.id} issue={i} bundle={bundle} />)}
      </div>
    </div>
  );
}

export function IssueBoard({ issues, bundle, teamId }: { issues: Issue[]; bundle: TeamBundle; teamId: string }) {
  const update = useUpdateIssue();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [dragging, setDragging] = useState<Issue | null>(null);

  const columns = bundle.states
    .filter((s) => s.category !== 'canceled' && (s.category !== 'triage' || issues.some((i) => i.state_id === s.id)))
    .sort((a, b) => STATE_ORDER.indexOf(a.category) - STATE_ORDER.indexOf(b.category) || a.position - b.position);

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const issue = issues.find((i) => i.id === e.active.id);
    const to = e.over?.id as string | undefined;
    if (!issue || !to || to === issue.state_id) return;
    update.mutate({ id: issue.id, patch: { state_id: to } });
    if (bundle.stateById.get(to)?.category === 'completed') {
      const r = (e.activatorEvent as PointerEvent | undefined);
      confetti({
        particleCount: 60,
        spread: 70,
        startVelocity: 30,
        colors: ['#2ead5b', '#7fdea5', '#b3edc8', '#ffd166'],
        origin: r ? { x: r.clientX / innerWidth, y: r.clientY / innerHeight } : undefined,
      });
    }
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setDragging(issues.find((i) => i.id === e.active.id) ?? null)}
      onDragCancel={() => setDragging(null)}
      onDragEnd={onDragEnd}
    >
      <div className="flex h-full gap-3 overflow-x-auto px-4 pb-4 sm:px-6">
        {columns.map((s) => (
          <Column key={s.id} state={s} bundle={bundle} teamId={teamId} issues={issues.filter((i) => i.state_id === s.id).sort(byPriority)} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }}>
        {dragging && <IssueCard issue={dragging} bundle={bundle} overlay />}
      </DragOverlay>
    </DndContext>
  );
}
