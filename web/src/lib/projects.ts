import { addDays, differenceInCalendarDays, eachDayOfInterval, format, parseISO } from 'date-fns';
import type { Issue, ProjectHealth, ProjectStatus, WorkflowState } from './types';

export const STATUS_META: Record<ProjectStatus, { label: string; color: string }> = {
  planned: { label: 'Planned', color: '#64748b' },
  in_progress: { label: 'In progress', color: '#2ead5b' },
  paused: { label: 'Paused', color: '#eab308' },
  completed: { label: 'Completed', color: '#5b6fd6' },
  canceled: { label: 'Canceled', color: '#ef4444' },
};

export const HEALTH_META: Record<ProjectHealth, { label: string; color: string; emoji: string }> = {
  on_track: { label: 'On track', color: '#2ead5b', emoji: '🟢' },
  at_risk: { label: 'At risk', color: '#eab308', emoji: '🟡' },
  off_track: { label: 'Off track', color: '#ef4444', emoji: '🔴' },
};

export interface ProjectStats {
  total: number;
  done: number;
  pct: number;
}

export function projectStats(issues: Issue[], stateById: Map<string, WorkflowState>): ProjectStats {
  const live = issues.filter((i) => stateById.get(i.state_id)?.category !== 'canceled');
  const done = live.filter((i) => stateById.get(i.state_id)?.category === 'completed').length;
  return { total: live.length, done, pct: live.length ? Math.round((done / live.length) * 100) : 0 };
}

/** Scope vs. completed over time, from issue created/completed timestamps. */
export function progressSeries(issues: Issue[], stateById: Map<string, WorkflowState>, start?: string | null) {
  const live = issues.filter((i) => stateById.get(i.state_id)?.category !== 'canceled');
  if (!live.length) return [];
  const first = start ?? live.map((i) => i.created_at.slice(0, 10)).sort()[0];
  const days = eachDayOfInterval({ start: parseISO(first), end: new Date() });
  // Sample so long projects don't render hundreds of points.
  const step = Math.max(1, Math.ceil(days.length / 60));
  return days
    .filter((_, i) => i % step === 0 || i === days.length - 1)
    .map((d) => {
      const day = format(d, 'yyyy-MM-dd');
      return {
        day: format(d, 'MMM d'),
        scope: live.filter((i) => i.created_at.slice(0, 10) <= day).length,
        completed: live.filter((i) => i.completed_at && i.completed_at.slice(0, 10) <= day).length,
      };
    });
}

/**
 * Predicted finish date from the last 3 weeks of throughput. Returns null when there's
 * not enough signal (nothing completed recently).
 */
export function predictCompletion(issues: Issue[], stateById: Map<string, WorkflowState>): { date: string; daysLate?: number } | null {
  const { total, done } = projectStats(issues, stateById);
  const remaining = total - done;
  if (total === 0) return null;
  if (remaining === 0) return { date: format(new Date(), 'yyyy-MM-dd') };
  const windowDays = 21;
  const since = addDays(new Date(), -windowDays).toISOString();
  const recent = issues.filter((i) => i.completed_at && i.completed_at >= since).length;
  if (recent === 0) return null;
  const perDay = recent / windowDays;
  return { date: format(addDays(new Date(), Math.ceil(remaining / perDay)), 'yyyy-MM-dd') };
}

export function lateness(predicted: string, target: string | null): number | null {
  if (!target) return null;
  return differenceInCalendarDays(parseISO(predicted), parseISO(target));
}
