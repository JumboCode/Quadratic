import type { ReactNode } from 'react';
import { CalendarDays, CircleUser, Folder, RefreshCcw, Tag } from 'lucide-react';
import type { Cycle, Label, Person, Project, WorkflowState } from '../../lib/types';
import { cn, cycleName, dueLabel, PRIORITIES, todayISO } from '../../lib/utils';
import { PriorityIcon, StateIcon } from '../icons';
import { Avatar, Picker } from '../ui';

/** Small pill-shaped trigger used for issue properties. */
export function Chip({ children, className, muted }: { children: ReactNode; className?: string; muted?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-2 text-[13px] transition hover:border-brand-300',
        muted && 'text-muted',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatePicker({ states, value, onChange, compact }: { states: WorkflowState[]; value: string; onChange: (id: string) => void; compact?: boolean }) {
  const cur = states.find((s) => s.id === value);
  return (
    <Picker
      value={value}
      onChange={(v) => v && onChange(v)}
      placeholder="Change status…"
      options={states.map((s) => ({ value: s.id, label: s.name, icon: <StateIcon category={s.category} color={s.color} /> }))}
      trigger={
        compact ? (
          <span className="flex cursor-pointer p-0.5" title={cur?.name}>
            {cur && <StateIcon category={cur.category} color={cur.color} />}
          </span>
        ) : (
          <Chip>
            {cur && <StateIcon category={cur.category} color={cur.color} />}
            {cur?.name ?? 'Status'}
          </Chip>
        )
      }
    />
  );
}

export function PriorityPicker({ value, onChange, compact }: { value: number; onChange: (p: number) => void; compact?: boolean }) {
  return (
    <Picker
      value={String(value)}
      onChange={(v) => onChange(Number(v ?? 0))}
      placeholder="Set priority…"
      options={PRIORITIES.map((p) => ({ value: String(p.value), label: p.label, icon: <PriorityIcon priority={p.value} /> }))}
      trigger={
        compact ? (
          <span className="flex cursor-pointer p-0.5" title={PRIORITIES[value].label}>
            <PriorityIcon priority={value} />
          </span>
        ) : (
          <Chip muted={value === 0}>
            <PriorityIcon priority={value} />
            {PRIORITIES[value].label}
          </Chip>
        )
      }
    />
  );
}

export function AssigneePicker({
  people, value, onChange, compact, align,
}: { people: Person[]; value: string | null; onChange: (id: string | null) => void; compact?: boolean; align?: 'left' | 'right' }) {
  const cur = people.find((p) => p.id === value);
  return (
    <Picker
      align={align}
      value={value}
      onChange={onChange}
      placeholder="Assign to…"
      options={[
        { value: '', label: 'Unassigned', icon: <CircleUser className="size-4 text-muted" /> },
        ...people.filter((p) => p.active || p.id === value).map((p) => ({
          value: p.id,
          label: p.name,
          hint: p.github_login ? `@${p.github_login}` : undefined,
          icon: <Avatar name={p.name} size={18} />,
        })),
      ]}
      trigger={
        compact ? (
          <span className="flex cursor-pointer" title={cur?.name ?? 'Unassigned'}>
            {cur ? <Avatar name={cur.name} size={20} /> : <CircleUser className="size-5 text-muted" />}
          </span>
        ) : (
          <Chip muted={!cur}>
            {cur ? <Avatar name={cur.name} size={16} /> : <CircleUser className="size-4" />}
            {cur?.name ?? 'Assignee'}
          </Chip>
        )
      }
    />
  );
}

export function LabelPicker({ labels, value, onChange }: { labels: Label[]; value: string[]; onChange: (ids: string[]) => void }) {
  const chosen = labels.filter((l) => value.includes(l.id));
  return (
    <Picker
      multiple
      value={value}
      onChange={(_v, all) => onChange(all ?? [])}
      placeholder="Add labels…"
      options={labels.map((l) => ({ value: l.id, label: l.name, icon: <span className="size-2.5 rounded-full" style={{ background: l.color }} /> }))}
      trigger={
        <Chip muted={!chosen.length} className="h-auto min-h-7 flex-wrap py-1">
          <Tag className="size-3.5" />
          {chosen.length
            ? chosen.map((l) => (
                <span key={l.id} className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-full" style={{ background: l.color }} />
                  {l.name}
                </span>
              ))
            : 'Labels'}
        </Chip>
      }
    />
  );
}

export function CyclePicker({ cycles, value, onChange }: { cycles: Cycle[]; value: string | null; onChange: (id: string | null) => void }) {
  const cur = cycles.find((c) => c.id === value);
  const today = todayISO();
  const usable = cycles.filter((c) => c.ends_on >= today || c.id === value);
  return (
    <Picker
      value={value}
      onChange={onChange}
      placeholder="Add to sprint…"
      options={[
        { value: '', label: 'No sprint', icon: <RefreshCcw className="size-4 text-muted" /> },
        ...usable.map((c) => ({
          value: c.id,
          label: cycleName(c),
          hint: c.starts_on <= today ? 'current' : c.starts_on.slice(5),
          icon: <RefreshCcw className="size-4 text-brand-500" />,
        })),
      ]}
      trigger={
        <Chip muted={!cur}>
          <RefreshCcw className="size-3.5" />
          {cur ? cycleName(cur) : 'Sprint'}
        </Chip>
      }
    />
  );
}

export function ProjectPicker({ projects, value, onChange }: { projects: Project[]; value: string | null; onChange: (id: string | null) => void }) {
  const cur = projects.find((p) => p.id === value);
  return (
    <Picker
      value={value}
      onChange={onChange}
      placeholder="Add to project…"
      options={[
        { value: '', label: 'No project', icon: <Folder className="size-4 text-muted" /> },
        ...projects.map((p) => ({ value: p.id, label: p.name, icon: <span>{p.emoji}</span> })),
      ]}
      trigger={
        <Chip muted={!cur}>
          {cur ? <span>{cur.emoji}</span> : <Folder className="size-3.5" />}
          <span className="max-w-40 truncate">{cur?.name ?? 'Project'}</span>
        </Chip>
      }
    />
  );
}

export function DueDateInput({ value, onChange }: { value: string | null; onChange: (d: string | null) => void }) {
  const due = value ? dueLabel(value) : null;
  return (
    <label className="relative">
      <Chip
        muted={!value}
        className={cn(due?.tone === 'late' && 'border-red-300 text-red-600', due?.tone === 'soon' && 'border-amber-300 text-amber-600')}
      >
        <CalendarDays className="size-3.5" />
        {due?.text ?? 'Due date'}
      </Chip>
      <input
        type="date"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label="Due date"
      />
    </label>
  );
}

export function EstimateInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <Picker
      value={value == null ? '' : String(value)}
      onChange={(v) => onChange(v ? Number(v) : null)}
      placeholder="Estimate…"
      options={[
        { value: '', label: 'No estimate' },
        ...[1, 2, 3, 5, 8].map((n) => ({ value: String(n), label: `${n} point${n > 1 ? 's' : ''}` })),
      ]}
      trigger={<Chip muted={value == null}>△ {value ?? 'Estimate'}</Chip>}
    />
  );
}
