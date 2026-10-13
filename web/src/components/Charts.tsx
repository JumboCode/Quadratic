import type { ReactNode } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
  type TooltipProps,
} from 'recharts';
import { useUI } from '../lib/ui-context';

/**
 * Chart colors, validated with the dataviz palette checker against each theme's surface:
 * series 1 = green (done / remaining work), series 2 = indigo (scope). The ideal burndown
 * is a dashed muted guide, not a data series.
 */
function useChartColors() {
  const { theme } = useUI();
  return theme === 'dark'
    ? { s1: '#2ea866', s2: '#7385e8', grid: '#22372c', axis: '#8aa596', guide: '#8aa596' }
    : { s1: '#208c48', s2: '#5b6fd6', grid: '#e3efe7', axis: '#5b7466', guide: '#94a89c' };
}

const axisProps = (color: string) => ({
  tick: { fill: color, fontSize: 11 },
  tickLine: false,
  axisLine: false,
});

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey as string} className="flex items-center gap-2">
          <span className="h-0.5 w-3 rounded-full" style={{ background: p.color }} />
          <span className="text-muted">{p.name}</span>
          <span className="ml-auto font-semibold tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="w-4 border-t-2" style={{ borderColor: i.color, borderStyle: i.dashed ? 'dashed' : 'solid' }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Collapsible table so values are never color-only. */
function DataTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-muted hover:text-ink">View as table</summary>
      <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-line">
        <table className="w-full">
          <thead className="bg-surface-2 text-left">
            <tr>{columns.map((c) => <th key={c} className="px-2 py-1 font-medium">{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                {r.map((v, j) => <td key={j} className="px-2 py-1 tabular-nums">{v}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Frame({ children, height = 220 }: { children: ReactNode; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">{children as React.ReactElement}</ResponsiveContainer>
    </div>
  );
}

export function BurndownChart({ data }: { data: { day: string; remaining: number | null; ideal: number }[] }) {
  const c = useChartColors();
  return (
    <div>
      <Legend items={[{ label: 'Remaining points', color: c.s1 }, { label: 'Ideal pace', color: c.guide, dashed: true }]} />
      <Frame>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="day" {...axisProps(c.axis)} minTickGap={24} />
          <YAxis allowDecimals={false} {...axisProps(c.axis)} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: c.axis, strokeDasharray: '3 3' }} />
          <Line name="Ideal pace" dataKey="ideal" stroke={c.guide} strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          <Line
            name="Remaining"
            dataKey="remaining"
            stroke={c.s1}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
            connectNulls={false}
          />
        </LineChart>
      </Frame>
      <DataTable columns={['Day', 'Remaining', 'Ideal']} rows={data.map((d) => [d.day, d.remaining ?? '—', d.ideal])} />
    </div>
  );
}

export function VelocityChart({ data }: { data: { name: string; points: number }[] }) {
  const c = useChartColors();
  return (
    <div>
      <Frame height={180}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="name" {...axisProps(c.axis)} />
          <YAxis allowDecimals={false} {...axisProps(c.axis)} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: c.grid, opacity: 0.5 }} />
          <Bar name="Points completed" dataKey="points" fill={c.s1} radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </Frame>
      <DataTable columns={['Sprint', 'Points completed']} rows={data.map((d) => [d.name, d.points])} />
    </div>
  );
}

export function ProgressChart({ data }: { data: { day: string; scope: number; completed: number }[] }) {
  const c = useChartColors();
  return (
    <div>
      <Legend items={[{ label: 'Scope', color: c.s2 }, { label: 'Completed', color: c.s1 }]} />
      <Frame>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="day" {...axisProps(c.axis)} minTickGap={32} />
          <YAxis allowDecimals={false} {...axisProps(c.axis)} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: c.axis, strokeDasharray: '3 3' }} />
          <Area name="Scope" dataKey="scope" type="stepAfter" stroke={c.s2} strokeWidth={2} fill={c.s2} fillOpacity={0.08} />
          <Area name="Completed" dataKey="completed" type="stepAfter" stroke={c.s1} strokeWidth={2} fill={c.s1} fillOpacity={0.18} />
        </AreaChart>
      </Frame>
      <DataTable columns={['Day', 'Scope', 'Completed']} rows={data.map((d) => [d.day, d.scope, d.completed])} />
    </div>
  );
}
