import { useEffect, useId, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from 'recharts';
import { ChartColumnBig } from 'lucide-react';
import { compactNumber, formatMoney, isZero, niceTicks } from '../../lib/format';
import { EmptyState } from '../ui/primitives';

const axisTick = { fill: 'var(--text-3)', fontSize: 12, fontWeight: 520, fontFamily: 'var(--font-sans)' };
const axisTickInverse = { ...axisTick, fill: 'rgba(244, 241, 234, 0.62)' };

function GlassTooltip({
  active,
  payload,
  label,
  rows,
}: {
  active?: boolean;
  payload?: { value: number; dataKey: string; color?: string; payload: Record<string, unknown> }[];
  label?: string;
  rows: { key: string; label: string; color: string }[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="chart-tip">
      <div className="ct-title">{(p.full as string) ?? label}</div>
      {rows.map((r) => {
        const v = p[r.key] as number;
        if (v === undefined) return null;
        return (
          <div key={r.key} className="ct-row">
            <span className="dot" style={{ '--c': r.color } as React.CSSProperties} />
            <span className="grow">{r.label}</span>
            <strong className="num money-val">{formatMoney(v)}</strong>
          </div>
        );
      })}
    </div>
  );
}

export function CashflowChart({
  data,
  height = 260,
  showNet = true,
}: {
  data: { label: string; full?: string; income: number; expense: number; net: number; partial?: boolean }[];
  height?: number;
  showNet?: boolean;
}) {
  const id = useId().replace(/:/g, '');
  const ticks = niceTicks(
    Math.min(...data.map((d) => Math.min(d.income, d.expense, showNet ? d.net : 0))),
    Math.max(...data.map((d) => Math.max(d.income, d.expense, showNet ? d.net : 0))),
  );
  // Bulan berjalan belum lengkap: batang dibuat pudar dan garis laba menuju titiknya putus-putus.
  const rows = data.map((d, i) => ({
    ...d,
    netDone: d.partial ? undefined : d.net,
    netNow: d.partial || data[i + 1]?.partial ? d.net : undefined,
  }));
  if (data.every((d) => isZero(d.income) && isZero(d.expense))) {
    return (
      <div className="chart-empty" style={{ height }}>
        <EmptyState compact icon={ChartColumnBig} title="Belum ada arus kas" text="Grafik terisi otomatis setelah Anda mencatat pemasukan atau pengeluaran." />
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={3} barCategoryGap="26%">
        <defs>
          <linearGradient id={`inc-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--chart-inc)" stopOpacity={1} />
            <stop offset="1" stopColor="var(--chart-inc)" stopOpacity={0.78} />
          </linearGradient>
          <linearGradient id={`exp-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--chart-exp)" stopOpacity={1} />
            <stop offset="1" stopColor="var(--chart-exp)" stopOpacity={0.78} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="0" />
        <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} dy={6} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} width={52} ticks={ticks} domain={[ticks[0], ticks[ticks.length - 1]]} tickFormatter={(v: number) => (v < 0 ? '−' : '') + compactNumber(Math.abs(v))} />
        <ReferenceLine y={0} stroke="var(--line-2)" />
        <Tooltip
          cursor={{ fill: 'var(--fill)', radius: 8 } as object}
          content={(p) => (
            <GlassTooltip
              {...(p as object)}
              rows={[
                { key: 'income', label: 'Pendapatan', color: 'var(--chart-inc)' },
                { key: 'expense', label: 'Beban', color: 'var(--chart-exp)' },
                ...(showNet ? [{ key: 'net', label: 'Laba bersih', color: 'var(--chart-net)' }] : []),
              ]}
            />
          )}
        />
        <Bar dataKey="income" fill={`url(#inc-${id})`} radius={[5, 5, 2, 2]} maxBarSize={20} animationDuration={800} animationEasing="ease-out">
          {rows.map((d) => (
            <Cell key={d.label} fillOpacity={d.partial ? 0.45 : 1} />
          ))}
        </Bar>
        <Bar dataKey="expense" fill={`url(#exp-${id})`} radius={[5, 5, 2, 2]} maxBarSize={20} animationDuration={800} animationBegin={90} animationEasing="ease-out">
          {rows.map((d) => (
            <Cell key={d.label} fillOpacity={d.partial ? 0.45 : 1} />
          ))}
        </Bar>
        {showNet && (
          <Line
            type="monotone"
            dataKey="netDone"
            stroke="var(--chart-net)"
            strokeWidth={2.2}
            dot={{ r: 3, fill: 'var(--surface)', stroke: 'var(--chart-net)', strokeWidth: 2 }}
            activeDot={{ r: 5, strokeWidth: 2, fill: 'var(--surface)' }}
            animationDuration={900}
          />
        )}
        {showNet && rows.some((d) => d.partial) && (
          <Line
            type="monotone"
            dataKey="netNow"
            stroke="var(--chart-net)"
            strokeWidth={2}
            strokeDasharray="4 4"
            strokeOpacity={0.7}
            dot={(p: { cx?: number; cy?: number; payload?: { partial?: boolean }; index?: number }) =>
              p.payload?.partial && p.cx != null && p.cy != null ? (
                <circle key={`np-${p.index}`} cx={p.cx} cy={p.cy} r={3} fill="var(--surface)" stroke="var(--chart-net)" strokeWidth={2} strokeDasharray="2 2" />
              ) : (
                <g key={`np-${p.index}`} />
              )
            }
            activeDot={false}
            animationDuration={900}
            legendType="none"
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function TrendArea({
  data,
  dataKey,
  height = 120,
  color = 'var(--chart-nw)',
  showAxis,
  label = 'Nilai',
  inverse,
}: {
  data: Record<string, number | string>[];
  dataKey: string;
  height?: number;
  color?: string;
  showAxis?: boolean;
  label?: string;
  /** Untuk grafik di atas latar gelap/berwarna (kartu utama) */
  inverse?: boolean;
}) {
  const id = useId().replace(/:/g, '');
  const values = data.map((d) => Number(d[dataKey]) || 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.15 || Math.abs(max) * 0.1 || 1;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`ta-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity={inverse ? 0.26 : 0.3} />
            <stop offset="1" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {showAxis && <XAxis dataKey="label" tick={inverse ? axisTickInverse : axisTick} tickLine={false} axisLine={false} dy={2} padding={{ left: 22, right: 22 }} interval="preserveStartEnd" />}
        <YAxis hide domain={max === min ? [min - 1, min + 5] : [min - pad, max + pad]} />
        <Tooltip
          cursor={{ stroke: inverse ? 'rgba(244, 241, 234, 0.35)' : 'var(--line-strong)', strokeWidth: 1, strokeDasharray: '3 3' }}
          content={(p) => <GlassTooltip {...(p as object)} rows={[{ key: dataKey, label, color: inverse ? 'var(--chart-nw)' : color }]} />}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2.2}
          fill={`url(#ta-${id})`}
          animationDuration={1000}
          activeDot={{ r: 4.5, strokeWidth: 2, stroke: inverse ? 'var(--accent)' : 'var(--surface)', fill: color }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function Donut({
  data,
  size = 188,
  thickness = 22,
  center,
  onHover,
  active,
}: {
  data: { id: string; name: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  center?: React.ReactNode;
  onHover?: (id: string | null) => void;
  active?: string | null;
}) {
  const r = size / 2;
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <PieChart width={size} height={size}>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx={r}
          cy={r}
          innerRadius={r - thickness}
          outerRadius={r - 2}
          paddingAngle={data.length > 1 ? 2.2 : 0}
          cornerRadius={5}
          stroke="none"
          startAngle={90}
          endAngle={-270}
          animationDuration={800}
          onMouseLeave={() => onHover?.(null)}
        >
          {data.map((d) => (
            <Cell
              key={d.id}
              fill={d.color}
              opacity={active && active !== d.id ? 0.28 : 1}
              style={{ transition: 'opacity 200ms', cursor: 'pointer', outline: 'none' }}
              onMouseEnter={() => onHover?.(d.id)}
            />
          ))}
        </Pie>
      </PieChart>
      {center && <div className="donut-center">{center}</div>}
    </div>
  );
}

/** Sparkline SVG ringan */
export function Sparkline({ values, color = 'var(--chart-nw)', height = 32, width = 96, fill = true }: { values: number[]; color?: string; height?: number; width?: number; fill?: boolean }) {
  const id = useId().replace(/:/g, '');
  const path = useMemo(() => {
    if (values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - 3 - ((v - min) / span) * (height - 6)]);
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const cx = (x0 + x1) / 2;
      d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
    }
    return { d, area: `${d} L${width},${height} L0,${height} Z`, last: pts[pts.length - 1] };
  }, [values, width, height]);
  if (!path) return <svg width={width} height={height} />;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="sparkline" aria-hidden>
      <defs>
        <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity={0.25} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {fill && <path d={path.area} fill={`url(#sp-${id})`} />}
      <path d={path.d} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" className="sp-line" />
      <circle cx={path.last[0]} cy={path.last[1]} r={2.6} fill={color} />
    </svg>
  );
}

/** Cincin progres (mis. anggaran) */
export function Ring({ value, size = 64, stroke = 7, color = 'var(--bar-accent)', children }: { value: number; size?: number; stroke?: number; color?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [v, setV] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setV(Math.max(0, Math.min(1, value))));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(.16,1,.3,1)' }}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}
