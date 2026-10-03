import { TrendingUp, Scale, Waves, Landmark, Table2, Gauge, HandCoins, Handshake, Target, type Glyph } from '../lib/glyphs';

export type ReportKey = 'laba-rugi' | 'neraca' | 'arus-kas' | 'ekuitas' | 'lajur' | 'rasio' | 'umur-piutang' | 'umur-hutang' | 'anggaran';

/** Daftar laporan (dipakai halaman Laporan dan jejak halaman di bilah atas). */
export const REPORTS: { key: ReportKey; label: string; desc: string; icon: Glyph; compare: boolean }[] = [
  { key: 'laba-rugi', label: 'Laba Rugi', desc: 'Kinerja pendapatan & beban', icon: TrendingUp, compare: true },
  { key: 'neraca', label: 'Posisi Keuangan', desc: 'Aset, liabilitas, ekuitas', icon: Scale, compare: true },
  { key: 'arus-kas', label: 'Arus Kas', desc: 'Operasi, investasi, pendanaan', icon: Waves, compare: true },
  { key: 'ekuitas', label: 'Perubahan Ekuitas', desc: 'Mutasi modal & saldo laba', icon: Landmark, compare: false },
  { key: 'lajur', label: 'Neraca Lajur', desc: 'Kertas kerja 10 kolom', icon: Table2, compare: false },
  { key: 'rasio', label: 'Rasio Keuangan', desc: 'Likuiditas, solvabilitas, profitabilitas', icon: Gauge, compare: false },
  { key: 'umur-piutang', label: 'Umur Piutang', desc: 'Analisis jatuh tempo piutang', icon: HandCoins, compare: false },
  { key: 'umur-hutang', label: 'Umur Hutang', desc: 'Analisis jatuh tempo hutang', icon: Handshake, compare: false },
  { key: 'anggaran', label: 'Anggaran vs Realisasi', desc: 'Varians per kategori', icon: Target, compare: false },
];
