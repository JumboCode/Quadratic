import type { StateCategory } from '../lib/types';

/** Linear-style status glyph: dashed for triage/backlog, ring for todo, pie for in progress, check for done. */
export function StateIcon({ category, color, size = 14 }: { category: StateCategory; color: string; size?: number }) {
  const s = size;
  const r = s / 2 - 1.25;
  const c = s / 2;
  switch (category) {
    case 'triage':
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden>
          <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth="1.5" />
          <path d={`M${c - 2.5} ${c}h5M${c} ${c - 2.5}v5`} stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'backlog':
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden>
          <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="2 2" />
        </svg>
      );
    case 'unstarted':
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden>
          <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth="1.5" />
        </svg>
      );
    case 'started':
    case 'review': {
      const frac = category === 'started' ? 0.5 : 0.75;
      const inner = r - 2;
      const a = frac * 2 * Math.PI;
      const x = c + inner * Math.sin(a);
      const y = c - inner * Math.cos(a);
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden>
          <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth="1.5" />
          <path d={`M${c} ${c} L${c} ${c - inner} A${inner} ${inner} 0 ${frac > 0.5 ? 1 : 0} 1 ${x} ${y} Z`} fill={color} />
        </svg>
      );
    }
    case 'completed':
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden>
          <circle cx={c} cy={c} r={c - 0.5} fill={color} />
          <path d={`M${c - 3} ${c} l2 2 l4 -4`} stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'canceled':
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden>
          <circle cx={c} cy={c} r={c - 0.5} fill={color} />
          <path d={`M${c - 2.5} ${c - 2.5}l5 5M${c + 2.5} ${c - 2.5}l-5 5`} stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
  }
}

/** Signal-bar priority glyph; urgent gets an exclamation badge. */
export function PriorityIcon({ priority, size = 14 }: { priority: number; size?: number }) {
  if (priority === 1) {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" aria-label="Urgent">
        <rect width="14" height="14" rx="3.5" fill="#f97316" />
        <path d="M7 3.5v4.2" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="7" cy="10.3" r="1" fill="#fff" />
      </svg>
    );
  }
  if (priority === 0) {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" aria-label="No priority">
        {[2, 6, 10].map((x) => <rect key={x} x={x} y="6.5" width="2.2" height="1.2" rx="0.6" fill="var(--muted)" />)}
      </svg>
    );
  }
  const filled = 5 - priority; // high=3 bars, medium=2, low=1
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-label={['', '', 'High', 'Medium', 'Low'][priority]}>
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={1.5 + i * 4}
          y={9 - i * 3}
          width="3"
          height={4 + i * 3}
          rx="1"
          fill={i < filled ? 'var(--ink)' : 'var(--line)'}
        />
      ))}
    </svg>
  );
}
