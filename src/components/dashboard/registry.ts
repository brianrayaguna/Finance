import type { ComponentType } from 'react';
import {
  PiggyBank,
  LayoutGrid,
  ChartColumnBig,
  ChartPie,
  Receipt,
  Wallet,
  Target,
  Handshake,
  HeartPulse,
  CalendarClock,
  ChartBarBig,
  CalendarDays,
  Star,
  Flag,
  ChartLine,
  Lightbulb,
  ShieldCheck,
  type Glyph,
} from '../../lib/glyphs';
import type { SettingValue, WidgetId } from '../../app/dashboardLayout';
import type { SettingDef, WidgetProps } from './types';
import { BudgetsWidget, CashflowWidget, CompositionWidget, DebtsWidget, HealthWidget, HeroWidget, KpiWidget, RecentWidget, WalletsWidget } from './core';
import { FinanceWidget, FlowWidget } from './combo';
import { DailyCashWidget, FavoritesWidget, GoalsWidget, HeatmapWidget, InsightsWidget, IntegrityWidget, TopCatsWidget, UpcomingWidget } from './extra';

export interface WidgetMeta {
  title: string;
  desc: string;
  icon: Glyph;
  /** Kelompok di galeri */
  group: 'Ringkasan' | 'Aktivitas' | 'Perencanaan' | 'Pembukuan';
  settings?: SettingDef[];
  Component: ComponentType<WidgetProps>;
}

const months = (def: string): SettingDef => ({
  key: 'range',
  label: 'Rentang',
  type: 'choice',
  options: [
    { value: '6', label: '6 bulan' },
    { value: '12', label: '12 bulan' },
  ],
  def,
});

export const WIDGETS: Record<WidgetId, WidgetMeta> = {
  hero: {
    title: 'Kekayaan bersih',
    desc: 'Aset dikurangi liabilitas beserta trennya',
    icon: PiggyBank,
    group: 'Ringkasan',
    settings: [months('12'), { key: 'split', label: 'Tampilkan total aset & liabilitas', type: 'toggle', def: true }],
    Component: HeroWidget,
  },
  kpi: {
    title: 'Indikator utama',
    desc: 'Empat angka pilihan: pendapatan, beban, kas, tabungan, dan lainnya',
    icon: LayoutGrid,
    group: 'Ringkasan',
    Component: KpiWidget,
  },
  cashflow: {
    title: 'Pendapatan & beban',
    desc: 'Grafik bulanan (akrual sebagian) beserta laba',
    icon: ChartColumnBig,
    group: 'Ringkasan',
    settings: [months('12'), { key: 'net', label: 'Tampilkan garis laba', type: 'toggle', def: true }],
    Component: CashflowWidget,
  },
  composition: {
    title: 'Komposisi',
    desc: 'Porsi beban atau pendapatan per kategori',
    icon: ChartPie,
    group: 'Aktivitas',
    settings: [
      {
        key: 'kind',
        label: 'Tampilkan',
        type: 'choice',
        options: [
          { value: 'expense', label: 'Beban' },
          { value: 'revenue', label: 'Pendapatan' },
        ],
        def: 'expense',
      },
    ],
    Component: CompositionWidget,
  },
  recent: {
    title: 'Transaksi terbaru',
    desc: 'Catatan terakhir, klik untuk mengubah',
    icon: Receipt,
    group: 'Aktivitas',
    settings: [
      {
        key: 'count',
        label: 'Jumlah',
        type: 'choice',
        options: [
          { value: '4', label: '4' },
          { value: '5', label: '5' },
          { value: '8', label: '8' },
        ],
        def: '5',
      },
    ],
    Component: RecentWidget,
  },
  wallets: {
    title: 'Dompet & rekening',
    desc: 'Saldo setiap dompet dan total likuid',
    icon: Wallet,
    group: 'Ringkasan',
    settings: [{ key: 'hideZero', label: 'Sembunyikan saldo nol', type: 'toggle', def: false }],
    Component: WalletsWidget,
  },
  budgets: {
    title: 'Anggaran bulan ini',
    desc: 'Realisasi terhadap batas per kategori',
    icon: Target,
    group: 'Perencanaan',
    settings: [
      {
        key: 'count',
        label: 'Jumlah',
        type: 'choice',
        options: [
          { value: '3', label: '3' },
          { value: '5', label: '5' },
          { value: '8', label: '8' },
        ],
        def: '5',
      },
      {
        key: 'sort',
        label: 'Urutan',
        type: 'choice',
        options: [
          { value: 'used', label: 'Paling terpakai' },
          { value: 'code', label: 'Urutan akun' },
        ],
        def: 'used',
      },
    ],
    Component: BudgetsWidget,
  },
  debts: {
    title: 'Hutang & piutang',
    desc: 'Saldo berjalan dan jatuh tempo terdekat',
    icon: Handshake,
    group: 'Perencanaan',
    Component: DebtsWidget,
  },
  health: {
    title: 'Kesehatan keuangan',
    desc: 'Tabungan, dana darurat, hutang, dan likuiditas',
    icon: HeartPulse,
    group: 'Pembukuan',
    Component: HealthWidget,
  },
  upcoming: {
    title: 'Jatuh tempo',
    desc: 'Tagihan hutang & piutang yang akan datang',
    icon: CalendarClock,
    group: 'Perencanaan',
    settings: [
      {
        key: 'days',
        label: 'Rentang',
        type: 'choice',
        options: [
          { value: '14', label: '14 hari' },
          { value: '30', label: '30 hari' },
          { value: '60', label: '60 hari' },
        ],
        def: '30',
      },
      { key: 'receivables', label: 'Sertakan piutang', type: 'toggle', def: true },
    ],
    Component: UpcomingWidget,
  },
  topcats: {
    title: 'Kategori teratas',
    desc: 'Pengeluaran terbesar dan perubahannya',
    icon: ChartBarBig,
    group: 'Aktivitas',
    settings: [
      {
        key: 'count',
        label: 'Jumlah',
        type: 'choice',
        options: [
          { value: '5', label: '5' },
          { value: '8', label: '8' },
        ],
        def: '5',
      },
    ],
    Component: TopCatsWidget,
  },
  heatmap: {
    title: 'Kalender pengeluaran',
    desc: 'Intensitas belanja harian dalam sebulan',
    icon: CalendarDays,
    group: 'Aktivitas',
    Component: HeatmapWidget,
  },
  favorites: {
    title: 'Transaksi favorit',
    desc: 'Catat transaksi rutin dengan sekali klik',
    icon: Star,
    group: 'Aktivitas',
    Component: FavoritesWidget,
  },
  goals: {
    title: 'Target tabungan',
    desc: 'Kemajuan menuju tujuan keuangan',
    icon: Flag,
    group: 'Perencanaan',
    Component: GoalsWidget,
  },
  dailycash: {
    title: 'Saldo kas harian',
    desc: 'Pergerakan kas, bank & e-wallet per hari',
    icon: ChartLine,
    group: 'Ringkasan',
    settings: [
      {
        key: 'range',
        label: 'Rentang',
        type: 'choice',
        options: [
          { value: '30', label: '30 hari' },
          { value: '60', label: '60 hari' },
          { value: '90', label: '90 hari' },
        ],
        def: '60',
      },
    ],
    Component: DailyCashWidget,
  },
  insights: {
    title: 'Wawasan',
    desc: 'Sorotan otomatis: kategori naik, anggaran, tagihan',
    icon: Lightbulb,
    group: 'Ringkasan',
    settings: [
      {
        key: 'count',
        label: 'Jumlah',
        type: 'choice',
        options: [
          { value: '3', label: '3' },
          { value: '5', label: '5' },
        ],
        def: '5',
      },
    ],
    Component: InsightsWidget,
  },
  flow: {
    title: 'Arus kas & komposisi',
    desc: 'Pendapatan-beban bulanan dan porsi per kategori dalam satu kartu bertab',
    icon: ChartColumnBig,
    group: 'Ringkasan',
    settings: [
      months('12'),
      { key: 'net', label: 'Tampilkan garis laba', type: 'toggle', def: true },
      {
        key: 'kind',
        label: 'Komposisi menampilkan',
        type: 'choice',
        options: [
          { value: 'expense', label: 'Beban' },
          { value: 'revenue', label: 'Pendapatan' },
        ],
        def: 'expense',
      },
    ],
    Component: FlowWidget,
  },
  finance: {
    title: 'Dompet, anggaran & hutang',
    desc: 'Saldo dompet, realisasi anggaran, dan hutang-piutang dalam satu kartu bertab',
    icon: Wallet,
    group: 'Perencanaan',
    settings: [
      { key: 'hideZero', label: 'Sembunyikan saldo nol (dompet)', type: 'toggle', def: false },
      {
        key: 'count',
        label: 'Jumlah anggaran',
        type: 'choice',
        options: [
          { value: '3', label: '3' },
          { value: '5', label: '5' },
          { value: '8', label: '8' },
        ],
        def: '5',
      },
      {
        key: 'sort',
        label: 'Urutan anggaran',
        type: 'choice',
        options: [
          { value: 'used', label: 'Paling terpakai' },
          { value: 'code', label: 'Urutan akun' },
        ],
        def: 'used',
      },
    ],
    Component: FinanceWidget,
  },
  integrity: {
    title: 'Integritas buku',
    desc: 'Keseimbangan debit–kredit dan pemeriksaan data',
    icon: ShieldCheck,
    group: 'Pembukuan',
    Component: IntegrityWidget,
  },
};

/** Pengaturan tersimpan digabung dengan nilai bawaan widget. */
export function widgetSettings(id: WidgetId, stored?: Record<string, SettingValue>): Record<string, SettingValue> {
  const out: Record<string, SettingValue> = {};
  for (const s of WIDGETS[id].settings ?? []) {
    const v = stored?.[s.key];
    if (s.type === 'toggle') out[s.key] = typeof v === 'boolean' ? v : s.def;
    else out[s.key] = typeof v === 'string' && s.options.some((o) => o.value === v) ? v : s.def;
  }
  return out;
}
