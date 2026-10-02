/* Formatting utilities — Indonesian locale (titik ribuan, koma desimal). */

const MINUS = '−';

const nf0 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const nf2fixed = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Pembulatan 2 desimal yang simetris (half away from zero): round2(-2.345) === -round2(2.345).
 * Pergeseran desimal lewat notasi eksponen ("1234.005e2") menghindari galat biner pada nominal
 * besar — cara lama (n + EPSILON) × 100 membulatkan 10.000,005 menjadi 10.000,00.
 * Nilai non-finit (NaN/Infinity) dianggap 0 agar tidak pernah merusak saldo buku.
 */
export const round2 = (n: number): number => {
  if (!Number.isFinite(n)) return 0;
  const abs = Math.abs(n);
  if (abs < 1e-6) return 0;
  const r = abs < 1e15 ? Number(`${Math.round(Number(`${abs}e2`))}e-2`) : abs;
  return Math.sign(n) * r || 0; // normalisasi −0 → 0
};

export const isZero = (n: number) => Math.abs(n) < 0.005;

/** 1234567.5 -> "1.234.567,5" */
export function formatNumber(n: number, decimals: 'auto' | 0 | 2 = 'auto'): string {
  if (!Number.isFinite(n)) return '0';
  const v = Math.abs(round2(n));
  let s: string;
  if (decimals === 0) s = nf0.format(Math.round(v));
  else if (decimals === 2) s = nf2fixed.format(v);
  else s = nf2.format(v);
  return (n < 0 && !isZero(n) ? MINUS : '') + s;
}

export interface MoneyOpts {
  sign?: 'auto' | 'always' | 'never';
  compact?: boolean;
  symbol?: boolean;
}

/** 1250000 -> "Rp 1.250.000" ; -5000 -> "−Rp 5.000" */
export function formatMoney(n: number, opts: MoneyOpts = {}): string {
  const { sign = 'auto', compact = false, symbol = true } = opts;
  const v = round2(n);
  const abs = Math.abs(v);
  const body = compact ? compactNumber(abs) : nf2.format(abs);
  const prefix = symbol ? 'Rp ' : '';
  let s = '';
  if (sign === 'always') s = isZero(v) ? '' : v > 0 ? '+' : MINUS;
  else if (sign === 'auto') s = v < 0 && !isZero(v) ? MINUS : '';
  return `${s}${prefix}${body}`;
}

/** Accounting format: negatives in parentheses, zero as "–" */
export function formatAccounting(n: number): string {
  const v = round2(n);
  if (isZero(v)) return '–';
  const s = nf2.format(Math.abs(v));
  return v < 0 ? `(${s})` : s;
}

const COMPACT_UNITS: [number, string][] = [
  [1e12, 'T'],
  [1e9, 'M'],
  [1e6, 'jt'],
  [1e3, 'rb'],
];

/** 1.250.000 → "1,25 jt". Pembulatan yang menembus satuan berikutnya naik satuan: 999.999 → "1 jt", bukan "1.000 rb". */
export function compactNumber(abs: number): string {
  const digits = (x: number) => (x < 10 ? 2 : x < 100 ? 1 : 0);
  const fmt = (x: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits(x) }).format(x);
  for (let i = 0; i < COMPACT_UNITS.length; i++) {
    const [base, unit] = COMPACT_UNITS[i];
    if (abs < base) continue;
    const x = abs / base;
    if (i > 0 && Number(x.toFixed(digits(x))) >= 1000) return `${fmt(x / 1000)} ${COMPACT_UNITS[i - 1][1]}`;
    return `${fmt(x)} ${unit}`;
  }
  return Math.round(abs) >= 1000 ? '1 rb' : nf0.format(abs);
}

/** Nilai rasio: "18,43x", "1.446x", "8,2 bln", "43,2%" — pemisah ribuan & desimal Indonesia. */
export function formatRatio(value: number | null, unit: 'x' | '%' | 'bulan'): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (unit === '%') return formatPercent(value);
  const big = Math.abs(value) >= 100;
  const digits = unit === 'bulan' ? (big ? 0 : 1) : big ? 0 : 2;
  const s = new Intl.NumberFormat('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Math.abs(value));
  return `${value < 0 ? MINUS : ''}${s}${unit === 'bulan' ? ' bln' : 'x'}`;
}

export function formatPercent(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '–';
  const s = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(
    Math.abs(n * 100),
  );
  return `${n < 0 ? MINUS : ''}${s}%`;
}

/* ─────────── Dates ─────────── */

export const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export const DAYS_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function todayISO(): string {
  return toISO(new Date());
}
/** Tanggal lokal (bukan UTC) dari cap waktu — hindari toISOString() yang bergeser di zona UTC+7. */
export function isoFromTs(ts: number): string {
  return toISO(new Date(ts));
}
export function nowTime(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}
export function addMonths(iso: string, n: number): string {
  const d = parseISO(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISO(d);
}
export function startOfMonth(iso: string): string {
  return iso.slice(0, 7) + '-01';
}
export function endOfMonth(iso: string): string {
  const d = parseISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}
export function startOfYear(iso: string): string {
  return iso.slice(0, 4) + '-01-01';
}
export function endOfYear(iso: string): string {
  return iso.slice(0, 4) + '-12-31';
}
export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = startOfMonth(from);
  const end = startOfMonth(to);
  let guard = 0;
  while (cur <= end && guard++ < 600) {
    out.push(cur.slice(0, 7));
    cur = addMonths(cur, 1);
  }
  return out;
}
export function fiscalYearStart(iso: string, startMonth: number): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const year = m >= startMonth ? y : y - 1;
  return `${year}-${pad(startMonth)}-01`;
}

/** "25 Sep 2026" */
export function formatDate(iso: string, style: 'short' | 'medium' | 'long' | 'full' = 'medium'): string {
  if (!iso) return '';
  const d = parseISO(iso);
  const day = d.getDate();
  const m = d.getMonth();
  const y = d.getFullYear();
  switch (style) {
    case 'short':
      return `${pad(day)}/${pad(m + 1)}/${y}`;
    case 'long':
      return `${day} ${MONTHS[m]} ${y}`;
    case 'full':
      return `${DAYS[d.getDay()]}, ${day} ${MONTHS[m]} ${y}`;
    default:
      return `${day} ${MONTHS_SHORT[m]} ${y}`;
  }
}

export function formatMonth(key: string, short = false): string {
  const y = key.slice(0, 4);
  const m = Number(key.slice(5, 7)) - 1;
  return `${short ? MONTHS_SHORT[m] : MONTHS[m]} ${y}`;
}

export function relativeDay(iso: string, today = todayISO()): string {
  const diff = daysBetween(today, iso);
  if (diff === 0) return 'Hari ini';
  if (diff === -1) return 'Kemarin';
  if (diff === 1) return 'Besok';
  if (diff < 0 && diff > -7) return DAYS[parseISO(iso).getDay()];
  return formatDate(iso, 'long');
}

export function periodLabel(from: string, to: string): string {
  if (!from && !to) return 'Semua waktu';
  if (from === startOfMonth(from) && to === endOfMonth(from) && from.slice(0, 7) === to.slice(0, 7))
    return formatMonth(from.slice(0, 7));
  if (from === startOfYear(from) && to === endOfYear(from)) return `Tahun ${from.slice(0, 4)}`;
  return `${formatDate(from, 'long')} – ${formatDate(to, 'long')}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'K';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function uid(prefix = ''): string {
  const r = Math.random().toString(36).slice(2, 8);
  const t = Date.now().toString(36).slice(-5);
  return `${prefix}${t}${r}`;
}

export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Tick sumbu "bulat" (1, 2, 2,5, 5 × 10ⁿ) yang mencakup seluruh data, selalu memuat 0. */
export function niceTicks(minV: number, maxV: number, target = 4): number[] {
  const lo = Math.min(0, minV);
  const hi = Math.max(0, maxV);
  if (hi === lo) return [0];
  const raw = (hi - lo) / target;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const out: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + step / 1e6; v += step) out.push(Math.round(v / step) * step);
  return out;
}
