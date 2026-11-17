import { Suspense, lazy, startTransition, useEffect, useId, useMemo, useState, type ComponentProps } from 'react';
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

/**
 * Grafik recharts dirender setelah animasi masuk halaman & widget selesai (lihat [data-enter] di
 * base.css), lalu sebagai transition yang dapat disela. Merender SVG grafik di frame yang sama dengan
 * animasi masuk membuat animasinya tersendat; placeholder berukuran sama menjaga tata letak tetap.
 */
const DEFER_MS = 320;
function useDeferredChart() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => startTransition(() => setReady(true)), DEFER_MS);
    return () => window.clearTimeout(t);
  }, []);
  return ready;
}

export function CashflowChart(props: ComponentProps<HeavyModule['CashflowChart']>) {
  const ready = useDeferredChart();
  const fallback = <Placeholder height={props.height ?? 260} />;
  if (!ready) return fallback;
  return (
    <Suspense fallback={fallback}>
      <Heavy.CashflowChart {...props} />
    </Suspense>
  );
}

export function TrendArea(props: ComponentProps<HeavyModule['TrendArea']>) {
  const ready = useDeferredChart();
  const fallback = <Placeholder height={props.height ?? 120} />;
  if (!ready) return fallback;
  return (
    <Suspense fallback={fallback}>
      <Heavy.TrendArea {...props} />
    </Suspense>
  );
}

export function Donut(props: ComponentProps<HeavyModule['Donut']>) {
  const ready = useDeferredChart();
  const size = props.size ?? 188;
  const fallback = (
    <div className="donut" style={{ width: size, height: size }}>
      <Placeholder width={size} height={size} />
      {props.center && <div className="donut-center">{props.center}</div>}
    </div>
  );
  if (!ready) return fallback;
  return (
    <Suspense fallback={fallback}>
      <Heavy.Donut {...props} />
    </Suspense>
  );
}

/**
 * Sparkline SVG ringan. Diberi jarak 3 px di semua sisi agar garis & titik ujung tidak terpotong.
 * `fluid`: lebar mengikuti wadah (garis diregangkan, tebal garis tetap; titik ujung digambar terpisah agar tetap bulat).
 */
export function Sparkline({ values, color = 'var(--chart-nw)', height = 32, width = 96, fill = true, fluid = false }: { values: number[]; color?: string; height?: number; width?: number; fill?: boolean; fluid?: boolean }) {
  const id = useId().replace(/:/g, '');
  const PAD = 3;
  const path = useMemo(() => {
    if (values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const pts = values.map((v, i) => [PAD + (i / (values.length - 1)) * (width - PAD * 2), height - PAD - ((v - min) / span) * (height - PAD * 2)]);
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const cx = (x0 + x1) / 2;
      d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
    }
    const last = pts[pts.length - 1];
    return { d, area: `${d} L${last[0]},${height} L${pts[0][0]},${height} Z`, last };
  }, [values, width, height]);
  if (!path) return fluid ? null : <svg width={width} height={height} />;
  const svg = (
    <svg
      width={fluid ? '100%' : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={fluid ? 'none' : undefined}
      className="sparkline"
      aria-hidden
    >
      <defs>
        <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity={0.25} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {fill && <path d={path.area} fill={`url(#sp-${id})`} />}
      <path d={path.d} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" className="sp-line" vectorEffect={fluid ? 'non-scaling-stroke' : undefined} />
      {!fluid && <circle cx={path.last[0]} cy={path.last[1]} r={2.6} fill={color} />}
    </svg>
  );
  if (!fluid) return svg;
  return (
    <span className="sparkline-fluid" style={{ height }} aria-hidden>
      {svg}
      <span className="sp-dot" style={{ left: `${(path.last[0] / width) * 100}%`, top: `${(path.last[1] / height) * 100}%`, background: color }} />
    </span>
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
