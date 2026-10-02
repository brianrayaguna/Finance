/*
 * Model tata letak dasbor yang dapat disesuaikan.
 * Disimpan di preferensi (localStorage) dan ikut dalam berkas cadangan.
 * Modul ini murni (tanpa React) agar mudah diuji.
 */

export type WidgetId =
  | 'hero'
  | 'kpi'
  | 'cashflow'
  | 'composition'
  | 'recent'
  | 'wallets'
  | 'budgets'
  | 'debts'
  | 'health'
  | 'upcoming'
  | 'topcats'
  | 'heatmap'
  | 'favorites'
  | 'goals'
  | 'dailycash'
  | 'insights'
  | 'integrity'
  | 'flow'
  | 'finance';

/** s = 1/3 lebar, m = 1/2, l = 2/3, xl = penuh (grid 12 kolom) */
export type WidgetSize = 's' | 'm' | 'l' | 'xl';

export const SIZE_COLS: Record<WidgetSize, number> = { s: 4, m: 6, l: 8, xl: 12 };
export const SIZE_LABEL: Record<WidgetSize, string> = { s: 'Kecil', m: 'Sedang', l: 'Lebar', xl: 'Penuh' };

export type KpiMetric =
  | 'income'
  | 'expense'
  | 'net'
  | 'cash'
  | 'savingsRate'
  | 'investments'
  | 'assets'
  | 'liabilities'
  | 'receivables'
  | 'budgetLeft';

export const KPI_LABEL: Record<KpiMetric, string> = {
  income: 'Pendapatan',
  expense: 'Beban',
  net: 'Laba bersih',
  cash: 'Kas & setara kas',
  savingsRate: 'Tingkat tabungan',
  investments: 'Investasi',
  assets: 'Total aset',
  liabilities: 'Total liabilitas',
  receivables: 'Piutang',
  budgetLeft: 'Sisa anggaran',
};

export type SettingValue = string | number | boolean;

export interface DashLayout {
  /** Widget yang tampil, sesuai urutan. Widget yang tidak ada di sini tersembunyi. */
  order: WidgetId[];
  sizes: Partial<Record<WidgetId, WidgetSize>>;
  settings: Partial<Record<WidgetId, Record<string, SettingValue>>>;
  /** Isi empat kartu angka utama */
  kpi: KpiMetric[];
}

/** Ukuran yang diizinkan & bawaan per widget. Urutan array = urutan pilihan di UI. */
export const WIDGET_SIZES: Record<WidgetId, { sizes: WidgetSize[]; def: WidgetSize }> = {
  hero: { sizes: ['m', 'l', 'xl'], def: 'm' },
  kpi: { sizes: ['m', 'l', 'xl'], def: 'm' },
  cashflow: { sizes: ['m', 'l', 'xl'], def: 'l' },
  composition: { sizes: ['s', 'm'], def: 's' },
  recent: { sizes: ['m', 'l', 'xl'], def: 'l' },
  wallets: { sizes: ['s', 'm'], def: 's' },
  budgets: { sizes: ['s', 'm', 'l'], def: 's' },
  debts: { sizes: ['s', 'm'], def: 's' },
  health: { sizes: ['s', 'm'], def: 's' },
  upcoming: { sizes: ['s', 'm', 'l'], def: 's' },
  topcats: { sizes: ['s', 'm', 'l'], def: 'm' },
  heatmap: { sizes: ['s', 'm'], def: 's' },
  favorites: { sizes: ['s', 'm', 'l', 'xl'], def: 'm' },
  goals: { sizes: ['s', 'm', 'l'], def: 'm' },
  dailycash: { sizes: ['m', 'l', 'xl'], def: 'l' },
  insights: { sizes: ['s', 'm', 'l'], def: 'm' },
  integrity: { sizes: ['s', 'm'], def: 's' },
  flow: { sizes: ['m', 'l', 'xl'], def: 'l' },
  finance: { sizes: ['s', 'm'], def: 's' },
};

export const ALL_WIDGETS = Object.keys(WIDGET_SIZES) as WidgetId[];
export const ALL_KPI = Object.keys(KPI_LABEL) as KpiMetric[];
export const DEFAULT_KPI: KpiMetric[] = ['income', 'expense', 'net', 'cash'];

export type PresetId = 'lengkap' | 'sederhana' | 'akuntan';

export const PRESETS: Record<PresetId, { name: string; desc: string; order: WidgetId[]; sizes?: Partial<Record<WidgetId, WidgetSize>>; kpi: KpiMetric[] }> = {
  lengkap: {
    name: 'Lengkap',
    desc: 'Tata letak bawaan: posisi, arus kas & komposisi, kesehatan keuangan, transaksi, dan dompet-anggaran-hutang dalam kartu bertab',
    order: ['hero', 'kpi', 'flow', 'health', 'recent', 'finance'],
    sizes: { flow: 'l', health: 's', recent: 'l', finance: 's' },
    kpi: DEFAULT_KPI,
  },
  sederhana: {
    name: 'Sederhana',
    desc: 'Untuk pemakaian harian: saldo, favorit, anggaran, dan tagihan',
    order: ['hero', 'kpi', 'favorites', 'recent', 'finance', 'upcoming', 'goals'],
    sizes: { favorites: 'xl', recent: 'l', finance: 's', upcoming: 'm', goals: 'm' },
    kpi: ['income', 'expense', 'cash', 'budgetLeft'],
  },
  akuntan: {
    name: 'Akuntan',
    desc: 'Fokus laporan: laba, posisi, rasio, arus kas harian, dan integritas buku',
    order: ['kpi', 'cashflow', 'health', 'dailycash', 'integrity', 'topcats', 'insights', 'composition', 'debts', 'upcoming'],
    sizes: { kpi: 'xl', cashflow: 'l', health: 's', dailycash: 'l', integrity: 's', topcats: 'm', insights: 'm', composition: 's', debts: 's', upcoming: 's' },
    kpi: ['net', 'assets', 'liabilities', 'cash'],
  },
};

export function presetLayout(id: PresetId): DashLayout {
  const p = PRESETS[id];
  return { order: [...p.order], sizes: { ...(p.sizes ?? {}) }, settings: {}, kpi: [...p.kpi] };
}

export const defaultLayout = (): DashLayout => presetLayout('lengkap');

export function sizeOf(l: DashLayout, id: WidgetId): WidgetSize {
  const s = l.sizes[id];
  return s && WIDGET_SIZES[id].sizes.includes(s) ? s : WIDGET_SIZES[id].def;
}

/** Susunan bawaan versi sebelumnya (sembilan kartu terpisah) — pengguna yang belum mengubahnya dipindah ke susunan ringkas. */
const LEGACY_DEFAULT_ORDER = ['hero', 'kpi', 'cashflow', 'composition', 'recent', 'wallets', 'budgets', 'debts', 'health'];

function isLegacyDefault(r: Partial<DashLayout>): boolean {
  return (
    Array.isArray(r.order) &&
    r.order.length === LEGACY_DEFAULT_ORDER.length &&
    r.order.every((id, i) => id === LEGACY_DEFAULT_ORDER[i]) &&
    Object.keys(r.sizes ?? {}).length === 0 &&
    Object.keys(r.settings ?? {}).length === 0 &&
    (!Array.isArray(r.kpi) || r.kpi.every((k, i) => k === DEFAULT_KPI[i]))
  );
}

/** Membersihkan tata letak dari penyimpanan/cadangan: id tak dikenal, duplikat, ukuran & KPI tidak valid. */
export function sanitizeLayout(raw: unknown): DashLayout {
  const d = defaultLayout();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<DashLayout>;
  if (isLegacyDefault(r)) return d;
  const known = new Set<string>(ALL_WIDGETS);
  const order: WidgetId[] = [];
  if (Array.isArray(r.order)) for (const id of r.order) if (known.has(id) && !order.includes(id)) order.push(id);
  const sizes: DashLayout['sizes'] = {};
  if (r.sizes && typeof r.sizes === 'object')
    for (const [id, s] of Object.entries(r.sizes)) if (known.has(id) && WIDGET_SIZES[id as WidgetId].sizes.includes(s as WidgetSize)) sizes[id as WidgetId] = s as WidgetSize;
  const settings: DashLayout['settings'] = {};
  if (r.settings && typeof r.settings === 'object')
    for (const [id, v] of Object.entries(r.settings))
      if (known.has(id) && v && typeof v === 'object') {
        const clean: Record<string, SettingValue> = {};
        for (const [k, x] of Object.entries(v)) if (['string', 'number', 'boolean'].includes(typeof x)) clean[k] = x as SettingValue;
        settings[id as WidgetId] = clean;
      }
  const kpiKnown = new Set<string>(ALL_KPI);
  const kpi = Array.isArray(r.kpi) ? r.kpi.filter((k) => kpiKnown.has(k)).slice(0, 4) : [];
  for (const k of DEFAULT_KPI) if (kpi.length < 4 && !kpi.includes(k)) kpi.push(k);
  return { order: Array.isArray(r.order) ? order : d.order, sizes, settings, kpi };
}

/** Lebar dasar (kolom dari 12) sebuah widget pada lebar ruang dasbor tertentu. */
export function baseSpan(id: WidgetId, size: WidgetSize, width: number): number {
  if (width <= 640) return 12;
  // layar sedang: kartu lebar penuh, sisanya separuh
  if (width <= 820) return id === 'hero' || id === 'kpi' || size === 'l' || size === 'xl' ? 12 : 6;
  // laptop dengan sidebar terbuka (± 940–1100 px) tetap memakai kolom penuh agar halaman tidak memanjang
  return SIZE_COLS[size];
}

/**
 * Lebar tampil tiap widget sesuai urutan. Bila widget berikutnya tidak muat di sisa baris,
 * widget terakhir pada baris itu melebar mengisi sisanya — tidak ada celah kosong di tengah
 * dasbor, dan urutan tetap sama dengan urutan yang disusun pengguna.
 */
export function packSpans(l: DashLayout, width: number): number[] {
  const spans: number[] = [];
  let used = 0;
  for (const id of l.order) {
    const s = baseSpan(id, sizeOf(l, id), width);
    if (used > 0 && used + s > 12) {
      spans[spans.length - 1] += 12 - used;
      used = 0;
    }
    spans.push(s);
    used += s;
    if (used >= 12) used = 0;
  }
  return spans;
}

/** Pindahkan widget `id` ke posisi widget `target` (sebelum/sesudahnya). */
export function moveWidget(order: WidgetId[], id: WidgetId, target: WidgetId, after: boolean): WidgetId[] {
  if (id === target || !order.includes(id) || !order.includes(target)) return order;
  const rest = order.filter((x) => x !== id);
  const i = rest.indexOf(target) + (after ? 1 : 0);
  const next = [...rest.slice(0, i), id, ...rest.slice(i)];
  return next.every((x, k) => x === order[k]) ? order : next;
}

/** Geser widget satu langkah (−1 = lebih awal, +1 = lebih akhir). */
export function stepWidget(order: WidgetId[], id: WidgetId, dir: -1 | 1): WidgetId[] {
  const i = order.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
