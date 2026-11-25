export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export type AccountSubtype =
  // Aset
  | 'cash'
  | 'bank'
  | 'ewallet'
  | 'investment'
  | 'receivable'
  | 'prepaid'
  | 'inventory'
  | 'other_current_asset'
  | 'fixed_asset'
  | 'accum_depreciation'
  | 'other_asset'
  // Liabilitas
  | 'credit_card'
  | 'payable'
  | 'accrued'
  | 'loan'
  | 'other_current_liability'
  | 'long_term_liability'
  // Ekuitas
  | 'capital'
  | 'opening_equity'
  | 'retained_earnings'
  | 'drawing'
  | 'income_summary'
  // Pendapatan
  | 'operating_revenue'
  | 'other_revenue'
  // Beban
  | 'cogs'
  | 'operating_expense'
  | 'other_expense';

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subtype: AccountSubtype;
  icon: string;
  color: string;
  description?: string;
  archived?: boolean;
  system?: boolean;
  createdAt: number;
}

export type TxType =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'payable_new'
  | 'payable_pay'
  | 'receivable_new'
  | 'receivable_collect'
  | 'receivable_writeoff'
  | 'opening'
  | 'journal';

export type DebtCounter = 'wallet' | 'category' | 'opening';

export interface JournalLineInput {
  accountId: string;
  debit: number;
  credit: number;
  memo?: string;
}

export interface Transaction {
  id: string;
  type: TxType;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  amount: number;
  description: string;
  note?: string;
  /** Akun dompet (sumber untuk pengeluaran/transfer/pembayaran; tujuan untuk pemasukan/penerimaan) */
  accountId?: string;
  /** Tujuan transfer */
  toAccountId?: string;
  /** Akun pendapatan/beban */
  categoryId?: string;
  fee?: number;
  interest?: number;
  contact?: string;
  dueDate?: string;
  /** Transaksi induk (hutang/piutang asal) */
  parentId?: string;
  counter?: DebtCounter;
  /** Akun kontrol hutang/piutang */
  debtAccountId?: string;
  lines?: JournalLineInput[];
  adjusting?: boolean;
  ref: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

export type DepreciationMethod = 'straight_line' | 'declining_balance';

export interface FixedAsset {
  id: string;
  name: string;
  accountId: string;
  acquisitionDate: string;
  cost: number;
  residualValue: number;
  usefulLifeMonths: number;
  method: DepreciationMethod;
  /** false = tidak disusutkan (mis. tanah); kosong dianggap disusutkan */
  depreciable?: boolean;
  funding: 'wallet' | 'opening';
  paidFromAccountId?: string;
  disposal?: { date: string; proceeds: number; accountId: string };
  note?: string;
  ref: string;
  createdAt: number;
}

export type BudgetKind = 'expense' | 'debt';

export interface Budget {
  id: string;
  /** Jenis anggaran: 'expense' (bawaan bila tidak diisi demi kompatibilitas data lama) atau 'debt' (pembayaran hutang). */
  kind?: BudgetKind;
  /** Wajib untuk kind === 'expense' (atau kosong). */
  categoryId?: string;
  /** Opsional untuk kind === 'debt': id transaksi payable_new; kosong berarti semua pembayaran hutang. */
  debtId?: string;
  amount: number;
  createdAt: number;
}

export type BudgetTarget =
  | { kind: 'expense'; categoryId: string }
  | { kind: 'debt'; debtId?: string };

/* ───────── Persediaan (stok barang) ───────── */
/* Backlog: multi-varian, konversi multi-satuan, PPN/HSN, foto produk, bin/rak, impor CSV */

export type StockMoveType = 'in' | 'out' | 'adjust' | 'transfer';
export type StockFunding = 'wallet' | 'payable' | 'opening' | 'none';

export interface StockCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  createdAt: number;
}

export interface StockItem {
  id: string;
  sku: string;
  name: string;
  unit: string;
  minQty: number;
  sellPrice?: number;
  /** Modal/harga beli bawaan (prefill form Masuk) */
  costPrice?: number;
  /** Barcode terpisah dari SKU (leading zero aman sebagai string) */
  barcode?: string;
  brand?: string;
  categoryId?: string;
  /** Qty usulan pesan ulang saat stok rendah */
  reorderQty?: number;
  description?: string;
  notes?: string;
  inventoryAccountId: string;
  cogsAccountId?: string;
  revenueAccountId?: string;
  /** Lacak batch/kadaluarsa (gelombang 3) */
  trackBatch?: boolean;
  archived?: boolean;
  createdAt: number;
}

export interface StockLocation {
  id: string;
  name: string;
  archived?: boolean;
  createdAt: number;
}

export interface StockBatch {
  id: string;
  itemId: string;
  lot: string;
  expiry?: string;
  createdAt: number;
}

export interface StockMove {
  id: string;
  date: string;
  type: StockMoveType;
  itemId: string;
  locationId: string;
  toLocationId?: string;
  /** Selalu positif; arah ditentukan `type` (adjust: signed via `adjustSign`) */
  qty: number;
  /** +1 naik / -1 turun — hanya untuk type `adjust` */
  adjustSign?: 1 | -1;
  unitCost?: number;
  note?: string;
  ref: string;
  funding: StockFunding;
  walletAccountId?: string;
  payableAccountId?: string;
  batchId?: string;
  /** Tautan ke transaksi penjualan (gelombang 3) */
  saleTxId?: string;
  createdAt: number;
}

export type PurchaseOrderStatus = 'draft' | 'ordered' | 'partial' | 'received' | 'cancelled';

export interface PurchaseOrderLine {
  itemId: string;
  qty: number;
  unitCost: number;
  receivedQty: number;
}

export interface PurchaseOrder {
  id: string;
  date: string;
  supplier?: string;
  status: PurchaseOrderStatus;
  locationId: string;
  lines: PurchaseOrderLine[];
  note?: string;
  ref: string;
  createdAt: number;
  updatedAt: number;
}

export interface Profile {
  name: string;
  entityName: string;
  fiscalYearStartMonth: number;
  onboarded: boolean;
  createdAt: number;
  /**
   * Kunci periode (tutup buku), YYYY-MM-DD: transaksi, saldo awal, dan aset tetap bertanggal pada
   * atau sebelum tanggal ini tidak dapat ditambah, diubah, atau dihapus.
   */
  lockDate?: string;
  /** Nomor urut tertinggi yang pernah terbit per awalan/bulan (mis. "BKK/2026/09") — nomor tidak dipakai ulang */
  refSeq?: Record<string, number>;
}

/** Target tabungan: kemajuan = saldo gabungan dompet yang ditautkan */
export interface Goal {
  id: string;
  name: string;
  target: number;
  /** Tenggat opsional (YYYY-MM-DD) */
  targetDate?: string;
  /** Dompet (kas, bank, e-wallet, investasi) yang saldonya dihitung sebagai tabungan */
  accountIds: string[];
  icon: string;
  color: string;
  createdAt: number;
}

/** Transaksi favorit yang bisa dicatat dengan satu klik */
export interface TxTemplate {
  id: string;
  name: string;
  type: 'expense' | 'income' | 'transfer';
  /** Tanpa nominal → formulir dibuka dengan isian terisi */
  amount?: number;
  accountId?: string;
  toAccountId?: string;
  categoryId?: string;
  description?: string;
  createdAt: number;
}

export interface AppData {
  version: 1;
  profile: Profile;
  accounts: Account[];
  transactions: Transaction[];
  budgets: Budget[];
  assets: FixedAsset[];
  goals: Goal[];
  templates: TxTemplate[];
  stockCategories: StockCategory[];
  stockItems: StockItem[];
  stockLocations: StockLocation[];
  stockMoves: StockMove[];
  stockBatches: StockBatch[];
  purchaseOrders: PurchaseOrder[];
}

/* ───────── Journal (derived) ───────── */

export type CFClass = 'O' | 'I' | 'F';

export interface JournalLine {
  accountId: string;
  debit: number;
  credit: number;
  memo?: string;
  cf?: CFClass;
}

export type EntrySource = 'tx' | 'asset' | 'depreciation' | 'disposal' | 'stock';

export interface JournalEntry {
  id: string;
  date: string;
  ref: string;
  description: string;
  lines: JournalLine[];
  source: EntrySource;
  txId?: string;
  assetId?: string;
  stockMoveId?: string;
  txType?: TxType;
  opening?: boolean;
  adjusting?: boolean;
  cfOverride?: CFClass;
  sort: number;
}

/* ───────── Reports ───────── */

export type RowKind =
  | 'section'
  | 'group'
  | 'account'
  | 'subtotal'
  | 'total'
  | 'grandtotal'
  | 'note'
  | 'blank'
  | 'check';

export interface RowFormula {
  plus: string[];
  minus?: string[];
}

export interface ReportRow {
  key: string;
  label: string;
  code?: string;
  values: (number | null)[];
  kind: RowKind;
  indent: number;
  accountId?: string;
  formula?: RowFormula;
  /** Formula applies across columns (e.g. total column in equity matrix) */
  rowSumColumns?: boolean;
  italic?: boolean;
  unit?: 'pct';
}

export interface ReportColumn {
  label: string;
  sub?: string;
  kind?: 'value' | 'change' | 'percent' | 'text';
  /** For derived columns: index of [current, previous] value columns */
  of?: [number, number];
  width?: number;
  unit?: 'pct';
}

export interface ReportCheck {
  label: string;
  ok: boolean;
  diff: number;
}

export interface Report {
  id: string;
  title: string;
  subtitle: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  checks?: ReportCheck[];
  notes?: string[];
}
