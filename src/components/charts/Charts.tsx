import { Suspense, lazy, useEffect, useId, useMemo, useState, type ComponentProps } from 'react';
import { useLessMotion } from './motion';

/*
 * Grafik ringan (SVG murni) dimuat langsung; grafik recharts (±420 KB) dimuat lazy
 * agar tidak di-parse saat aplikasi dibuka di HP lambat. Placeholder berukuran sama
 * sehingga tata letak tidak bergeser ketika grafik selesai dimuat.
 */

const Heavy = {
  CashflowChart: lazy(() => import('./RechartsCharts').then((m) => ({ default: m.CashflowChart }))),
  TrendArea: lazy(() => import('./RechartsCharts').then((m) => ({ default: m.TrendArea }))),
  Donut: lazy(() => import('./RechartsCharts').then((m) => ({ default: m.Donut }))),
};

type HeavyModule = typeof import('./RechartsCharts');

/** Muat modul grafik lebih awal (mis. saat browser senggang) tanpa merendernya. */
export function preloadCharts() {
  return import('./RechartsCharts');
}

function Placeholder({ width = '100%', height }: { width?: number | string; height: number }) {
  return <div className="chart-placeholder" style={{ width, height }} aria-hidden />;
}

export function CashflowChart(props: ComponentProps<HeavyModule['CashflowChart']>) {
  return (
    <Suspense fallback={<Placeholder height={props.height ?? 260} />}>
      <Heavy.CashflowChart {...props} />
    </Suspense>
  );
}

export function TrendArea(props: ComponentProps<HeavyModule['TrendArea']>) {
  return (
    <Suspense fallback={<Placeholder height={props.height ?? 120} />}>
      <Heavy.TrendArea {...props} />
    </Suspense>
  );
}

export function Donut(props: ComponentProps<HeavyModule['Donut']>) {
  const size = props.size ?? 188;
  return (
    <Suspense
      fallback={
        <div className="donut" style={{ width: size, height: size }}>
          <Placeholder width={size} height={size} />
          {props.center && <div className="donut-center">{props.center}</div>}
        </div>
      }
    >
      <Heavy.Donut {...props} />
    </Suspense>
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
  const reduced = useLessMotion();
  const target = Math.max(0, Math.min(1, value));
  const [v, setV] = useState(reduced ? target : 0);
  useEffect(() => {
    if (reduced) {
      setV(target);
      return;
    }
    const id = requestAnimationFrame(() => setV(target));
    return () => cancelAnimationFrame(id);
  }, [target, reduced]);
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
          style={reduced ? undefined : { transition: 'stroke-dashoffset 900ms cubic-bezier(.16,1,.3,1)' }}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}
