import clsx, { type ClassValue } from 'clsx';
import { differenceInCalendarDays, format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import type { StateCategory } from './types';

export const cn = (...c: ClassValue[]) => clsx(c);

export const PRIORITIES = [
  { value: 0, label: 'No priority', short: '—' },
  { value: 1, label: 'Urgent', short: 'Urgent' },
  { value: 2, label: 'High', short: 'High' },
  { value: 3, label: 'Medium', short: 'Med' },
  { value: 4, label: 'Low', short: 'Low' },
] as const;

export const ROLE_LABEL = { pm: 'Project manager', tech_lead: 'Tech lead', designer: 'Designer' } as const;

export const STATE_ORDER: StateCategory[] = ['triage', 'backlog', 'unstarted', 'started', 'review', 'completed', 'canceled'];

export const isClosed = (c: StateCategory | undefined) => c === 'completed' || c === 'canceled';

export const toDate = (d: string) => parseISO(d);
export const fmtDate = (d: string | null | undefined, f = 'MMM d') => (d ? format(parseISO(d), f) : '');
export const ago = (d: string) => formatDistanceToNowStrict(parseISO(d), { addSuffix: true });
export const todayISO = () => format(new Date(), 'yyyy-MM-dd');
export const daysUntil = (d: string) => differenceInCalendarDays(parseISO(d), new Date());

/** "Due tomorrow", "3d overdue", … */
export function dueLabel(d: string): { text: string; tone: 'late' | 'soon' | 'ok' } {
  const n = daysUntil(d);
  if (n < 0) return { text: `${-n}d overdue`, tone: 'late' };
  if (n === 0) return { text: 'Due today', tone: 'soon' };
  if (n === 1) return { text: 'Tomorrow', tone: 'soon' };
  if (n <= 3) return { text: `In ${n}d`, tone: 'soon' };
  return { text: fmtDate(d), tone: 'ok' };
}

export const cycleName = (c: { name: string | null; number: number }) => c.name || `Sprint ${c.number}`;

type CycleDates = { starts_on: string; ends_on: string; completed_at: string | null };

/**
 * Where a sprint stands. A sprint marked complete is "completed" even if its end date hasn't
 * arrived yet (finished early), so always use this instead of comparing dates directly.
 */
export function cycleStatus(c: CycleDates, today = todayISO()): 'current' | 'upcoming' | 'completed' {
  if (c.completed_at || c.ends_on < today) return 'completed';
  return c.starts_on <= today ? 'current' : 'upcoming';
}

export const isCurrentCycle = (c: CycleDates, today = todayISO()) => cycleStatus(c, today) === 'current';

/** Academic year label for a date, e.g. "2026–27" (years start in August). */
export function academicYear(d = new Date()): string {
  const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}–${String(y + 1).slice(2)}`;
}

export const TEAM_EMOJIS = ['🐘', '🚀', '🌱', '🦄', '🔥', '🌊', '🍀', '🎨', '🧠', '⚡', '🌈', '🐢', '🦊', '🐝', '🎯', '🛠️'];
export const COLORS = ['#2EAD5B', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#eab308', '#ef4444', '#64748b'];
