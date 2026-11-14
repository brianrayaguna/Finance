import type { Account, AccountSubtype, AccountType, CFClass } from './types';

/* ───────── System account IDs (dipakai langsung oleh mesin jurnal) ───────── */
export const SYS = {
  cash: 'acc-cash',
  receivable: 'acc-receivable',
  payable: 'acc-payable',
  openingEquity: 'acc-opening-equity',
  capital: 'acc-capital',
  retained: 'acc-retained',
  drawing: 'acc-drawing',
  incomeSummary: 'acc-income-summary',
  bankFee: 'acc-bank-fee',
  interestExpense: 'acc-interest-expense',
  interestIncome: 'acc-interest-income',
  badDebt: 'acc-bad-debt',
  depreciationExpense: 'acc-depreciation-expense',
  accumDepreciation: 'acc-accum-depreciation',
  gainDisposal: 'acc-gain-disposal',
  lossDisposal: 'acc-loss-disposal',
  /** Lawan penyesuaian saldo (rekonsiliasi) dompet */
  otherIncome: 'acc-other-income',
  otherExpense: 'acc-other-expense',
} as const;

export const TYPE_LABEL: Record<AccountType, string> = {
  asset: 'Aset',
  liability: 'Liabilitas',
  equity: 'Ekuitas',
  revenue: 'Pendapatan',
  expense: 'Beban',
};

export const TYPE_ORDER: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];

export const SUBTYPE_META: Record<
  AccountSubtype,
  { label: string; type: AccountType; group: string; order: number; cf: CFClass | 'cash'; codeBase: number }
> = {
  cash: { label: 'Kas Tunai', type: 'asset', group: 'Aset Lancar', order: 1, cf: 'cash', codeBase: 11100 },
  bank: { label: 'Rekening Bank', type: 'asset', group: 'Aset Lancar', order: 2, cf: 'cash', codeBase: 11200 },
  ewallet: { label: 'Dompet Digital', type: 'asset', group: 'Aset Lancar', order: 3, cf: 'cash', codeBase: 11300 },
  investment: { label: 'Investasi', type: 'asset', group: 'Aset Lancar', order: 4, cf: 'I', codeBase: 11400 },
  receivable: { label: 'Piutang', type: 'asset', group: 'Aset Lancar', order: 5, cf: 'O', codeBase: 11500 },
  prepaid: { label: 'Biaya Dibayar di Muka', type: 'asset', group: 'Aset Lancar', order: 6, cf: 'O', codeBase: 11600 },
  other_current_asset: { label: 'Aset Lancar Lainnya', type: 'asset', group: 'Aset Lancar', order: 7, cf: 'O', codeBase: 11900 },
  fixed_asset: { label: 'Aset Tetap', type: 'asset', group: 'Aset Tidak Lancar', order: 8, cf: 'I', codeBase: 12100 },
  accum_depreciation: { label: 'Akumulasi Penyusutan', type: 'asset', group: 'Aset Tidak Lancar', order: 9, cf: 'O', codeBase: 12900 },
  other_asset: { label: 'Aset Tidak Lancar Lainnya', type: 'asset', group: 'Aset Tidak Lancar', order: 10, cf: 'I', codeBase: 12500 },

  credit_card: { label: 'Kartu Kredit / PayLater', type: 'liability', group: 'Liabilitas Jangka Pendek', order: 11, cf: 'O', codeBase: 21200 },
  payable: { label: 'Hutang', type: 'liability', group: 'Liabilitas Jangka Pendek', order: 12, cf: 'O', codeBase: 21100 },
  accrued: { label: 'Beban Masih Harus Dibayar', type: 'liability', group: 'Liabilitas Jangka Pendek', order: 13, cf: 'O', codeBase: 21300 },
  loan: { label: 'Pinjaman Jangka Pendek', type: 'liability', group: 'Liabilitas Jangka Pendek', order: 14, cf: 'F', codeBase: 21400 },
  other_current_liability: { label: 'Liabilitas Lancar Lainnya', type: 'liability', group: 'Liabilitas Jangka Pendek', order: 15, cf: 'O', codeBase: 21900 },
  long_term_liability: { label: 'Liabilitas Jangka Panjang', type: 'liability', group: 'Liabilitas Jangka Panjang', order: 16, cf: 'F', codeBase: 22100 },

  capital: { label: 'Modal', type: 'equity', group: 'Ekuitas', order: 17, cf: 'F', codeBase: 31000 },
  opening_equity: { label: 'Ekuitas Saldo Awal', type: 'equity', group: 'Ekuitas', order: 18, cf: 'F', codeBase: 31100 },
  retained_earnings: { label: 'Saldo Laba', type: 'equity', group: 'Ekuitas', order: 19, cf: 'F', codeBase: 32000 },
  drawing: { label: 'Prive', type: 'equity', group: 'Ekuitas', order: 20, cf: 'F', codeBase: 33000 },
  income_summary: { label: 'Ikhtisar Laba Rugi', type: 'equity', group: 'Ekuitas', order: 21, cf: 'F', codeBase: 39000 },

  operating_revenue: { label: 'Pendapatan Utama', type: 'revenue', group: 'Pendapatan Utama', order: 22, cf: 'O', codeBase: 41000 },
  other_revenue: { label: 'Pendapatan Lain-lain', type: 'revenue', group: 'Pendapatan Lain-lain', order: 23, cf: 'O', codeBase: 42000 },

  cogs: { label: 'Harga Pokok Penjualan', type: 'expense', group: 'Harga Pokok Penjualan', order: 24, cf: 'O', codeBase: 51000 },
  operating_expense: { label: 'Beban Operasional', type: 'expense', group: 'Beban Operasional', order: 25, cf: 'O', codeBase: 61000 },
  other_expense: { label: 'Beban Lain-lain', type: 'expense', group: 'Beban Lain-lain', order: 26, cf: 'O', codeBase: 71000 },
};

export const WALLET_SUBTYPES: AccountSubtype[] = ['cash', 'bank', 'ewallet', 'investment', 'credit_card'];
export const CASH_SUBTYPES: AccountSubtype[] = ['cash', 'bank', 'ewallet'];

export const isWallet = (a?: Account) => !!a && WALLET_SUBTYPES.includes(a.subtype);
export const isCashEq = (a?: Account) => !!a && CASH_SUBTYPES.includes(a.subtype);
export const isPL = (a?: Account) => !!a && (a.type === 'revenue' || a.type === 'expense');
export const isCategory = isPL;

/** Saldo normal: debit untuk aset/beban/prive; kredit untuk liabilitas/ekuitas/pendapatan/akumulasi penyusutan. */
export function normalSide(a: Account): 'debit' | 'credit' {
  if (a.subtype === 'accum_depreciation') return 'credit';
  if (a.subtype === 'drawing') return 'debit';
  return a.type === 'asset' || a.type === 'expense' ? 'debit' : 'credit';
}

export function signedBalance(a: Account, debit: number, credit: number): number {
  return normalSide(a) === 'debit' ? debit - credit : credit - debit;
}

export function formatCode(n: number): string {
  const s = String(n);
  return `${s[0]}-${s.slice(1)}`;
}

export function nextCode(accounts: Account[], subtype: AccountSubtype): string {
  const base = SUBTYPE_META[subtype].codeBase;
  const used = new Set(accounts.map((a) => a.code));
  const top = Math.floor(base / 1000) * 1000 + 999;
  for (let n = base; n <= top; n += 10) {
    const c = formatCode(n);
    if (!used.has(c)) return c;
  }
  for (let n = base; n <= top; n++) {
    const c = formatCode(n);
    if (!used.has(c)) return c;
  }
  return formatCode(base) + '-' + (accounts.length + 1);
}

const T = 1700000000000;
type Seed = [id: string, code: string, name: string, subtype: AccountSubtype, icon: string, color: string, system?: boolean, desc?: string];

const SEEDS: Seed[] = [
  // ASET
  [SYS.cash, '1-1100', 'Kas Tunai', 'cash', 'wallet', '#4C8A58', true],
  [SYS.receivable, '1-1500', 'Piutang', 'receivable', 'hand-coins', '#2E7F80', true, 'Piutang usaha & pinjaman yang diberikan'],
  ['acc-prepaid', '1-1600', 'Biaya Dibayar di Muka', 'prepaid', 'hourglass', '#78736A'],
  ['acc-equipment', '1-2100', 'Peralatan & Elektronik', 'fixed_asset', 'laptop', '#57609F'],
  ['acc-vehicle', '1-2110', 'Kendaraan', 'fixed_asset', 'car', '#3B6A96'],
  ['acc-building', '1-2120', 'Tanah & Bangunan', 'fixed_asset', 'building', '#8A6546'],
  ['acc-furniture', '1-2130', 'Perabot Rumah', 'fixed_asset', 'sofa', '#A88B5E'],
  [SYS.accumDepreciation, '1-2900', 'Akumulasi Penyusutan', 'accum_depreciation', 'trending-down', '#78736A', true],
  // LIABILITAS
  [SYS.payable, '2-1100', 'Hutang', 'payable', 'handshake', '#C8792C', true, 'Hutang usaha & pinjaman yang diterima'],
  ['acc-accrued', '2-1300', 'Beban Masih Harus Dibayar', 'accrued', 'receipt', '#78736A'],
  ['acc-longterm-loan', '2-2100', 'Pinjaman Jangka Panjang', 'long_term_liability', 'landmark', '#A8432F'],
  // EKUITAS
  [SYS.capital, '3-1000', 'Modal Pemilik', 'capital', 'vault', '#B8603C', true],
  [SYS.openingEquity, '3-1100', 'Ekuitas Saldo Awal', 'opening_equity', 'scale', '#8A6546', true],
  [SYS.retained, '3-2000', 'Saldo Laba', 'retained_earnings', 'piggy-bank', '#4C8A58', true],
  [SYS.drawing, '3-3000', 'Prive', 'drawing', 'shopping-bag', '#B95D78', true],
  [SYS.incomeSummary, '3-9000', 'Ikhtisar Laba Rugi', 'income_summary', 'calculator', '#78736A', true],
  // PENDAPATAN
  ['acc-salary', '4-1100', 'Gaji & Upah', 'operating_revenue', 'briefcase', '#4C8A58'],
  ['acc-bonus', '4-1110', 'Bonus & Tunjangan', 'operating_revenue', 'trophy', '#B8912A'],
  ['acc-business', '4-1120', 'Pendapatan Usaha', 'operating_revenue', 'store', '#5F9A82'],
  ['acc-freelance', '4-1130', 'Freelance & Jasa', 'operating_revenue', 'laptop', '#3C8AAE'],
  ['acc-investment-income', '4-1140', 'Hasil Investasi', 'operating_revenue', 'trending-up', '#57609F'],
  [SYS.interestIncome, '4-2100', 'Pendapatan Bunga', 'other_revenue', 'percent', '#2E7F80', true],
  ['acc-gift-income', '4-2110', 'Hadiah & Pemberian', 'other_revenue', 'gift', '#B95D78'],
  [SYS.gainDisposal, '4-2200', 'Laba Pelepasan Aset', 'other_revenue', 'badge-percent', '#4C8A58', true],
  [SYS.otherIncome, '4-2900', 'Pendapatan Lain-lain', 'other_revenue', 'coins', '#78736A', true, 'Juga menampung selisih lebih penyesuaian saldo'],
  // HPP
  ['acc-cogs', '5-1000', 'Harga Pokok Penjualan', 'cogs', 'package', '#8A6546'],
  // BEBAN OPERASIONAL
  ['acc-food', '6-1100', 'Makan & Minum', 'operating_expense', 'utensils', '#C8792C'],
  ['acc-groceries', '6-1110', 'Belanja Kebutuhan', 'operating_expense', 'shopping-cart', '#4C8A58'],
  ['acc-transport', '6-1120', 'Transportasi', 'operating_expense', 'car', '#3B6A96'],
  ['acc-housing', '6-1130', 'Tempat Tinggal', 'operating_expense', 'house', '#8A6546'],
  ['acc-utilities', '6-1140', 'Listrik, Air & Internet', 'operating_expense', 'zap', '#B8912A'],
  ['acc-subscription', '6-1150', 'Pulsa & Langganan', 'operating_expense', 'wifi', '#3C8AAE'],
  ['acc-health', '6-1160', 'Kesehatan', 'operating_expense', 'heart-pulse', '#A8432F'],
  ['acc-education', '6-1170', 'Pendidikan', 'operating_expense', 'graduation-cap', '#57609F'],
  ['acc-entertainment', '6-1180', 'Hiburan & Rekreasi', 'operating_expense', 'film', '#85578F'],
  ['acc-shopping', '6-1190', 'Belanja Pribadi', 'operating_expense', 'shopping-bag', '#B95D78'],
  ['acc-family', '6-1200', 'Keluarga & Anak', 'operating_expense', 'baby', '#B8603C'],
  ['acc-charity', '6-1210', 'Donasi & Zakat', 'operating_expense', 'hand-helping', '#5F9A82'],
  ['acc-insurance', '6-1220', 'Asuransi', 'operating_expense', 'shield', '#2E7F80'],
  ['acc-tax', '6-1230', 'Pajak', 'operating_expense', 'calculator', '#78736A'],
  ['acc-maintenance', '6-1240', 'Perawatan & Perbaikan', 'operating_expense', 'wrench', '#A88B5E'],
  [SYS.bankFee, '6-1250', 'Biaya Administrasi Bank', 'operating_expense', 'landmark', '#78736A', true],
  [SYS.depreciationExpense, '6-1260', 'Beban Penyusutan', 'operating_expense', 'trending-down', '#78736A', true],
  [SYS.badDebt, '6-1270', 'Beban Piutang Tak Tertagih', 'operating_expense', 'receipt-text', '#A8432F', true],
  // BEBAN LAIN-LAIN
  [SYS.interestExpense, '7-1100', 'Beban Bunga', 'other_expense', 'percent', '#C8792C', true],
  [SYS.lossDisposal, '7-1200', 'Rugi Pelepasan Aset', 'other_expense', 'trending-down', '#A8432F', true],
  [SYS.otherExpense, '7-1900', 'Beban Lain-lain', 'other_expense', 'folder', '#78736A', true, 'Juga menampung selisih kurang penyesuaian saldo'],
];

/** ID akun sistem (dilindungi dari penghapusan & perubahan jenis). */
export const SYSTEM_IDS: ReadonlySet<string> = new Set(SEEDS.filter((x) => x[6]).map((x) => x[0]));

export function defaultAccounts(): Account[] {
  return SEEDS.map(([id, code, name, subtype, icon, color, system, description], i) => ({
    id,
    code,
    name,
    type: SUBTYPE_META[subtype].type,
    subtype,
    icon,
    color,
    system: !!system,
    description,
    createdAt: T + i,
  }));
}

export function sortAccounts(list: Account[]): Account[] {
  return [...list].sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
}

export const WALLET_PRESETS: { subtype: AccountSubtype; label: string; icon: string; color: string }[] = [
  { subtype: 'cash', label: 'Kas Tunai', icon: 'wallet', color: '#4C8A58' },
  { subtype: 'bank', label: 'Rekening Bank', icon: 'landmark', color: '#3B6A96' },
  { subtype: 'ewallet', label: 'Dompet Digital', icon: 'smartphone', color: '#57609F' },
  { subtype: 'investment', label: 'Investasi', icon: 'trending-up', color: '#85578F' },
  { subtype: 'credit_card', label: 'Kartu Kredit / PayLater', icon: 'credit-card', color: '#A8432F' },
];
