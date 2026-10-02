import { createContext, useContext, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, ChevronRight } from 'lucide-react';
import type { Books, MonthPoint, Position } from '../../accounting/reports';
import { formatMoney, formatPercent, isZero } from '../../lib/format';
import { Sparkline } from '../charts/Charts';

/** Data bersama seluruh widget dasbor (dihitung sekali per bulan terpilih). */
export interface DashData {
  b: Books;
  today: string;
  /** YYYY-MM yang dipilih */
  month: string;
  from: string;
  to: string;
  /** Tanggal posisi: akhir bulan, atau hari ini untuk bulan berjalan */
  asOf: string;
  prevFrom: string;
  prevTo: string;
  isCurrent: boolean;
  /** Akhir periode pembanding: tanggal yang sama bulan lalu bila bulan berjalan, selain itu akhir bulan lalu */
  prevEnd: string;
  /** Pendapatan/beban/laba pada periode pembanding (sebanding dengan bulan terpilih) */
  prevFlow: { income: number; expense: number; net: number };
  /** 12 bulan berakhir di bulan terpilih (belum dipangkas) */
  series: MonthPoint[];
  /** Bulan transaksi pertama yang dicatat pengguna (YYYY-MM) */
  startMonth?: string;
  pos: Position;
  prevPos: Position;
  /** Preferensi angka ringkas (rb/jt) */
  compact: boolean;
  /** Lebar area dasbor (px) — layar sempit memakai grafik pendek dan angka ringkas */
  width: number;
}

export const DashCtx = createContext<DashData | null>(null);

export function useDash(): DashData {
  const v = useContext(DashCtx);
  if (!v) throw new Error('useDash di luar dasbor');
  return v;
}

/** Nominal ringkas hanya untuk angka besar (≥ 1 juta) dan bila preferensi angka ringkas aktif. */
export const shortMoney = (v: number, compact: boolean, opts: { sign?: 'auto' | 'always' } = {}) =>
  formatMoney(v, { compact: compact && Math.abs(v) >= 1e6, sign: opts.sign });

/**
 * Buang bulan-bulan sebelum pengguna mulai mencatat (transaksi pertama), sisakan minimal `min`
 * bulan. Penyusutan aset yang dibeli sebelum itu tidak dianggap awal pencatatan. Tanpa transaksi,
 * patokannya aktivitas pendapatan/beban, lalu saldo.
 */
export function trimSeries<T extends { month: string; income: number; expense: number; netWorth: number }>(all: T[], startMonth?: string, min = 3): T[] {
  let first = startMonth ? all.findIndex((m) => m.month >= startMonth) : -1;
  if (first < 0) first = all.findIndex((m) => !isZero(m.income) || !isZero(m.expense));
  if (first < 0) first = all.findIndex((m) => !isZero(m.netWorth));
  if (first <= 0) return all;
  return all.slice(Math.min(first, Math.max(0, all.length - min)));
}

export const isFlat = (values: number[]) => values.length < 2 || values.every((v) => Math.abs(v - values[0]) < 0.5);

/** Sparkline yang disembunyikan bila datanya datar (tidak informatif). */
export function Spark({ values, color }: { values: number[]; color: string }) {
  if (isFlat(values)) return null;
  return <Sparkline values={values} color={color} />;
}

/**
 * Perubahan dibanding periode sebelumnya.
 * Bila periode sebelumnya nol, persentase tidak bermakna — tampilkan selisih rupiah.
 */
export function Delta({ cur, prev, invert, unit = 'money', compact = true, vs = 'bulan sebelumnya' }: { cur: number; prev: number; invert?: boolean; unit?: 'money' | 'points'; compact?: boolean; vs?: string }) {
  const diff = cur - prev;
  if (isZero(prev) && isZero(cur)) return <span className="delta muted">—</span>;
  if (unit === 'money' ? isZero(diff) : Math.abs(diff) < 0.0005) return <span className="delta muted">Tetap</span>;
  const up = diff > 0;
  const good = invert ? !up : up;
  const I = up ? ArrowUpRight : ArrowDownRight;
  let text: ReactNode;
  let title: string;
  if (unit === 'points') {
    text = `${formatPercent(Math.abs(diff))} poin`;
    title = `${up ? 'Naik' : 'Turun'} ${formatPercent(Math.abs(diff))} poin dibanding ${vs}`;
  } else if (isZero(prev)) {
    text = <span className="money-val">{formatMoney(Math.abs(diff), { compact: compact && Math.abs(diff) >= 1e6 })}</span>;
    title = `${up ? 'Naik' : 'Turun'} ${formatMoney(Math.abs(diff))} dari nol pada ${vs}`;
  } else {
    text = formatPercent(Math.abs(diff / Math.abs(prev)));
    title = `${up ? 'Naik' : 'Turun'} ${formatMoney(Math.abs(diff))} dibanding ${vs}`;
  }
  return (
    <span className={`delta ${good ? 'good' : 'bad'}`} title={title}>
      <I aria-hidden />
      {text}
    </span>
  );
}

/**
 * Widget yang ditanam di dalam kartu bertab (lihat combo.tsx): kerangka kartu dan judul ditiadakan
 * karena tab sudah menjadi judulnya; subjudul & tautan tetap tampil.
 */
const EmbedCtx = createContext(false);
export const EmbedProvider = EmbedCtx.Provider;
export const useEmbedded = () => useContext(EmbedCtx);

/** Kepala kartu widget: judul, subjudul, tautan, dan aksi opsional. */
export function CardHead({ title, sub, to, link, actions }: { title: string; sub?: ReactNode; to?: string; link?: string; actions?: ReactNode }) {
  const embedded = useEmbedded();
  return (
    <div className={`card-head${embedded ? ' embedded' : ''}`}>
      <div className="grow" style={{ minWidth: 0 }}>
        <h2 className={embedded ? 'sr-only' : 'card-title'}>{title}</h2>
        {sub && <div className="card-sub">{sub}</div>}
      </div>
      {actions}
      {to && (
        <Link to={to} className="card-link">
          {link} <ChevronRight aria-hidden />
        </Link>
      )}
    </div>
  );
}

/** Kerangka kartu widget standar. */
export function WCard({ className = '', children }: { className?: string; children: ReactNode }) {
  const embedded = useEmbedded();
  return <div className={embedded ? `w-embed ${className}` : `card w-card ${className}`}>{children}</div>;
}
