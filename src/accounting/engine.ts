/*
 * Mesin jurnal double-entry.
 * Setiap transaksi diterjemahkan menjadi jurnal (debit = kredit), aset tetap menghasilkan
 * jurnal perolehan, penyusutan bulanan, dan pelepasan. Semua laporan diturunkan dari jurnal ini.
 */
import { endOfMonth, formatMonth, round2, todayISO, isZero, addMonths } from '../lib/format';
import { CASH_SUBTYPES, SYS, normalSide } from './coa';
import type {
  Account,
  AppData,
  CFClass,
  FixedAsset,
  JournalEntry,
  JournalLine,
  Transaction,
  TxType,
} from './types';

export const TX_META: Record<TxType, { label: string; prefix: string; short: string }> = {
  income: { label: 'Pemasukan', prefix: 'BKM', short: 'Masuk' },
  expense: { label: 'Pengeluaran', prefix: 'BKK', short: 'Keluar' },
  transfer: { label: 'Transfer', prefix: 'TRF', short: 'Transfer' },
  payable_new: { label: 'Hutang Baru', prefix: 'HTG', short: 'Hutang' },
  payable_pay: { label: 'Pembayaran Hutang', prefix: 'BYR', short: 'Bayar Hutang' },
  receivable_new: { label: 'Piutang Baru', prefix: 'PTG', short: 'Piutang' },
  receivable_collect: { label: 'Penerimaan Piutang', prefix: 'TRM', short: 'Terima Piutang' },
  receivable_writeoff: { label: 'Penghapusan Piutang', prefix: 'HPS', short: 'Hapus Piutang' },
  opening: { label: 'Saldo Awal', prefix: 'SA', short: 'Saldo Awal' },
  journal: { label: 'Jurnal Umum', prefix: 'JU', short: 'Jurnal' },
};

export function refPrefix(tx: Pick<Transaction, 'type' | 'adjusting'>): string {
  if (tx.type === 'journal' && tx.adjusting) return 'JP';
  return TX_META[tx.type].prefix;
}

/** Nomor bukti: BKK/2026/09/0007 — berurutan per jenis per bulan. */
export function nextRef(existing: { ref: string }[], prefix: string, date: string): string {
  const head = `${prefix}/${date.slice(0, 4)}/${date.slice(5, 7)}/`;
  let max = 0;
  for (const t of existing) {
    if (t.ref && t.ref.startsWith(head)) {
      const n = Number(t.ref.slice(head.length));
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return head + String(max + 1).padStart(4, '0');
}

export interface Ctx {
  acc: Map<string, Account>;
  txById: Map<string, Transaction>;
}

export function makeCtx(data: AppData): Ctx {
  return {
    acc: new Map(data.accounts.map((a) => [a.id, a])),
    txById: new Map(data.transactions.map((t) => [t.id, t])),
  };
}

const D = (accountId: string, amount: number, cf?: CFClass, memo?: string): JournalLine => ({
  accountId,
  debit: round2(amount),
  credit: 0,
  cf,
  memo,
});
const C = (accountId: string, amount: number, cf?: CFClass, memo?: string): JournalLine => ({
  accountId,
  debit: 0,
  credit: round2(amount),
  cf,
  memo,
});

export function defaultDescription(tx: Transaction, ctx: Ctx): string {
  const name = (id?: string) => (id ? ctx.acc.get(id)?.name ?? '' : '');
  switch (tx.type) {
    case 'income':
    case 'expense':
      return name(tx.categoryId);
    case 'transfer':
      return `Transfer ${name(tx.accountId)} → ${name(tx.toAccountId)}`;
    case 'payable_new':
      return `Hutang kepada ${tx.contact || '—'}`;
    case 'receivable_new':
      return `Piutang dari ${tx.contact || '—'}`;
    case 'payable_pay':
      return `Pembayaran hutang ${ctx.txById.get(tx.parentId ?? '')?.contact ?? ''}`.trim();
    case 'receivable_collect':
      return `Penerimaan piutang ${ctx.txById.get(tx.parentId ?? '')?.contact ?? ''}`.trim();
    case 'receivable_writeoff':
      return `Penghapusan piutang ${ctx.txById.get(tx.parentId ?? '')?.contact ?? ''}`.trim();
    case 'opening':
      return `Saldo awal ${name(tx.accountId)}`;
    default:
      return 'Jurnal umum';
  }
}

export function debtOrigin(tx: Transaction, ctx: Ctx): Transaction | undefined {
  if (tx.type === 'payable_new' || tx.type === 'receivable_new') return tx;
  return tx.parentId ? ctx.txById.get(tx.parentId) : undefined;
}

/** Menerjemahkan satu transaksi menjadi jurnal. */
export function journalizeTx(tx: Transaction, ctx: Ctx): JournalEntry | null {
  const amt = round2(Math.abs(tx.amount || 0));
  const lines: JournalLine[] = [];
  let opening = false;
  const has = (id?: string): id is string => !!id && ctx.acc.has(id);

  switch (tx.type) {
    case 'income': {
      if (!has(tx.accountId) || !has(tx.categoryId) || !amt) return null;
      lines.push(D(tx.accountId, amt), C(tx.categoryId, amt));
      break;
    }
    case 'expense': {
      if (!has(tx.accountId) || !has(tx.categoryId) || !amt) return null;
      lines.push(D(tx.categoryId, amt), C(tx.accountId, amt));
      break;
    }
    case 'transfer': {
      if (!has(tx.accountId) || !has(tx.toAccountId)) return null;
      const fee = round2(Math.abs(tx.fee || 0));
      if (!amt && !fee) return null;
      // Tarik tunai kartu kredit/PayLater (kartu → kas/bank) adalah pinjaman, bukan belanja operasional:
      // masuk aktivitas pendanaan. Pembayaran tagihan kartu (kas → kartu) tetap operasi.
      const from = ctx.acc.get(tx.accountId);
      const to = ctx.acc.get(tx.toAccountId);
      const cashAdvance = from?.subtype === 'credit_card' && !!to && CASH_SUBTYPES.includes(to.subtype);
      if (amt) lines.push(D(tx.toAccountId, amt));
      if (fee) lines.push(D(SYS.bankFee, fee, 'O', 'Biaya transfer'));
      lines.push(C(tx.accountId, amt + fee, cashAdvance ? 'F' : undefined));
      break;
    }
    case 'payable_new': {
      const debt = has(tx.debtAccountId) ? tx.debtAccountId : SYS.payable;
      if (!amt) return null;
      if (tx.counter === 'category') {
        if (!has(tx.categoryId)) return null;
        lines.push(D(tx.categoryId, amt, 'O'), C(debt, amt, 'O'));
      } else if (tx.counter === 'opening') {
        opening = true;
        lines.push(D(SYS.openingEquity, amt), C(debt, amt));
      } else {
        if (!has(tx.accountId)) return null;
        lines.push(D(tx.accountId, amt), C(debt, amt, 'F'));
      }
      break;
    }
    case 'payable_pay': {
      const origin = debtOrigin(tx, ctx);
      const debt = origin && has(origin.debtAccountId) ? origin.debtAccountId! : SYS.payable;
      const cf: CFClass = origin?.counter === 'category' ? 'O' : 'F';
      const interest = round2(Math.abs(tx.interest || 0));
      if (!has(tx.accountId) || (!amt && !interest)) return null;
      if (amt) lines.push(D(debt, amt, cf, 'Pokok'));
      if (interest) lines.push(D(SYS.interestExpense, interest, 'O', 'Bunga/denda'));
      lines.push(C(tx.accountId, amt + interest));
      break;
    }
    case 'receivable_new': {
      const debt = has(tx.debtAccountId) ? tx.debtAccountId : SYS.receivable;
      if (!amt) return null;
      if (tx.counter === 'category') {
        if (!has(tx.categoryId)) return null;
        lines.push(D(debt, amt, 'O'), C(tx.categoryId, amt, 'O'));
      } else if (tx.counter === 'opening') {
        opening = true;
        lines.push(D(debt, amt), C(SYS.openingEquity, amt));
      } else {
        if (!has(tx.accountId)) return null;
        lines.push(D(debt, amt, 'I'), C(tx.accountId, amt));
      }
      break;
    }
    case 'receivable_collect': {
      const origin = debtOrigin(tx, ctx);
      const debt = origin && has(origin.debtAccountId) ? origin.debtAccountId! : SYS.receivable;
      const cf: CFClass = origin?.counter === 'category' ? 'O' : 'I';
      const interest = round2(Math.abs(tx.interest || 0));
      if (!has(tx.accountId) || (!amt && !interest)) return null;
      lines.push(D(tx.accountId, amt + interest));
      if (amt) lines.push(C(debt, amt, cf, 'Pokok'));
      if (interest) lines.push(C(SYS.interestIncome, interest, 'O', 'Bunga/denda'));
      break;
    }
    case 'receivable_writeoff': {
      const origin = debtOrigin(tx, ctx);
      const debt = origin && has(origin.debtAccountId) ? origin.debtAccountId! : SYS.receivable;
      const cf: CFClass = origin?.counter === 'category' ? 'O' : 'I';
      if (!amt) return null;
      lines.push(D(SYS.badDebt, amt, 'O'), C(debt, amt, cf));
      break;
    }
    case 'opening': {
      if (!has(tx.accountId)) return null;
      const a = ctx.acc.get(tx.accountId)!;
      const v = round2(tx.amount || 0);
      if (isZero(v)) return null;
      opening = true;
      const debitNormal = normalSide(a) === 'debit';
      const positive = v > 0;
      if (debitNormal === positive) lines.push(D(a.id, Math.abs(v)), C(SYS.openingEquity, Math.abs(v)));
      else lines.push(D(SYS.openingEquity, Math.abs(v)), C(a.id, Math.abs(v)));
      break;
    }
    case 'journal': {
      let td = 0;
      let tc = 0;
      for (const l of tx.lines ?? []) {
        const d = round2(Math.abs(l.debit || 0));
        const c = round2(Math.abs(l.credit || 0));
        if (!d && !c) continue;
        // Baris bernominal dengan akun yang tidak ada → seluruh jurnal ditolak,
        // bukan dilewati diam-diam (melewatkan satu baris membuat buku tidak seimbang).
        if (!has(l.accountId)) return null;
        td += d;
        tc += c;
        lines.push({ accountId: l.accountId, debit: d, credit: c, memo: l.memo });
      }
      // Jurnal manual yang tidak seimbang tidak pernah diposting ke buku besar.
      if (lines.length < 2 || !isZero(td - tc)) return null;
      break;
    }
  }

  if (!lines.length) return null;
  return {
    id: 'je-' + tx.id,
    date: tx.date,
    ref: tx.ref,
    description: tx.description?.trim() || defaultDescription(tx, ctx),
    lines,
    source: 'tx',
    txId: tx.id,
    txType: tx.type,
    opening,
    adjusting: tx.type === 'journal' ? !!tx.adjusting : false,
    sort: tx.createdAt,
  };
}

/* ───────── Aset tetap & penyusutan ───────── */

export interface DepRow {
  period: string; // YYYY-MM
  date: string; // akhir bulan
  amount: number;
  accumulated: number;
  book: number;
}

/**
 * Jadwal penyusutan bulanan, dimulai akhir bulan setelah bulan perolehan.
 * - Garis lurus: (harga − residu) ÷ umur, bulan terakhir menyerap selisih pembulatan.
 * - Saldo menurun ganda: tarif 2 ÷ umur atas nilai buku, dan beralih ke garis lurus atas
 *   sisa nilai tersusutkan begitu garis lurus menghasilkan beban lebih besar (praktik standar),
 *   sehingga aset habis tersusut tepat di akhir umurnya tanpa lonjakan di bulan terakhir.
 */
export function depreciationSchedule(asset: FixedAsset): DepRow[] {
  const rows: DepRow[] = [];
  // Aset yang tidak disusutkan (mis. tanah) dicatat di buku tetapi tanpa jadwal penyusutan.
  if (asset.depreciable === false) return rows;
  const life = Math.max(1, Math.round(asset.usefulLifeMonths));
  const cost = round2(asset.cost);
  const residual = round2(Math.max(0, asset.residualValue || 0));
  const base = round2(cost - residual);
  if (!(base > 0) || !asset.acquisitionDate) return rows;
  let book = cost;
  let acc = 0;
  const monthlySL = base / life;
  for (let k = 1; k <= life; k++) {
    const date = endOfMonth(addMonths(asset.acquisitionDate.slice(0, 7) + '-01', k));
    const left = life - k + 1;
    let dep: number;
    if (asset.method === 'declining_balance') {
      const ddb = book * (2 / life);
      const sl = (book - residual) / left;
      dep = k === life ? book - residual : Math.max(ddb, sl);
      if (book - dep < residual) dep = book - residual;
    } else {
      dep = k === life ? base - acc : monthlySL;
    }
    dep = round2(Math.max(0, dep));
    if (dep <= 0) break;
    acc = round2(acc + dep);
    book = round2(asset.cost - acc);
    rows.push({ period: date.slice(0, 7), date, amount: dep, accumulated: acc, book });
  }
  return rows;
}

/** Tanggal pelepasan yang sah (tidak mendahului perolehan). */
export function disposalStop(asset: FixedAsset): string | undefined {
  const d = asset.disposal?.date;
  return d && d >= asset.acquisitionDate ? d : undefined;
}

/** Akumulasi penyusutan sampai tanggal tertentu (inklusif). */
export function accumulatedAt(asset: FixedAsset, date: string): number {
  let acc = 0;
  const stop = disposalStop(asset);
  for (const r of depreciationSchedule(asset)) {
    if (r.date > date) break;
    if (stop && r.date >= stop) break;
    acc = r.accumulated;
  }
  return acc;
}

export function assetEntries(asset: FixedAsset, ctx: Ctx, through: string, seqNo?: number): JournalEntry[] {
  const out: JournalEntry[] = [];
  if (!ctx.acc.has(asset.accountId)) return out;
  const opening = asset.funding === 'opening' || !asset.paidFromAccountId || !ctx.acc.has(asset.paidFromAccountId);
  out.push({
    id: `ast-${asset.id}`,
    date: asset.acquisitionDate,
    ref: asset.ref,
    description: `Perolehan aset tetap — ${asset.name}`,
    lines: [
      D(asset.accountId, asset.cost, 'I'),
      opening ? C(SYS.openingEquity, asset.cost) : C(asset.paidFromAccountId!, asset.cost),
    ],
    source: 'asset',
    assetId: asset.id,
    opening,
    sort: asset.createdAt,
  });

  // Pelepasan hanya berlaku bila benar-benar dijurnal (akun penerimaannya masih ada). Tanpa itu aset
  // tetap tercatat di buku, jadi penyusutannya pun tetap berjalan — bukan berhenti diam-diam.
  const disposed = !!asset.disposal && ctx.acc.has(asset.disposal.accountId) ? disposalStop(asset) : undefined;
  const stop = disposed;
  // Penyusutan diposting sampai akhir bulan berjalan. Bila pelepasan dijadwalkan sesudahnya, penyusutan
  // sampai tanggal pelepasan ikut diposting agar jurnal pelepasan (yang memakai akumulasi per tanggal
  // pelepasan) cocok dengan saldo akun akumulasi penyusutan.
  const limit = stop && stop > through ? stop : through;
  // Nomor urut unik per aset (bukan 4 digit terakhir nomor AST yang bisa sama antar-bulan perolehan).
  const seq = seqNo ? String(seqNo).padStart(4, '0') : asset.ref.slice(-4);
  for (const r of depreciationSchedule(asset)) {
    if (r.date > limit) break;
    if (stop && r.date >= stop) break;
    out.push({
      id: `dep-${asset.id}-${r.period}`,
      date: r.date,
      ref: `PNY/${r.period.slice(0, 4)}/${r.period.slice(5, 7)}/${seq}`,
      description: `Penyusutan ${asset.name} — ${formatMonth(r.period)}`,
      lines: [D(SYS.depreciationExpense, r.amount, 'O'), C(SYS.accumDepreciation, r.amount, 'O')],
      source: 'depreciation',
      assetId: asset.id,
      adjusting: true,
      sort: asset.createdAt + 1,
    });
  }

  if (asset.disposal && disposed) {
    const { date, accountId } = asset.disposal;
    const proceeds = round2(Math.max(0, asset.disposal.proceeds || 0));
    const accum = accumulatedAt(asset, date);
    const gain = round2(proceeds + accum - asset.cost);
    const lines: JournalLine[] = [];
    if (proceeds > 0) lines.push(D(accountId, proceeds));
    if (accum > 0) lines.push(D(SYS.accumDepreciation, accum));
    if (gain < 0) lines.push(D(SYS.lossDisposal, -gain));
    lines.push(C(asset.accountId, asset.cost));
    if (gain > 0) lines.push(C(SYS.gainDisposal, gain));
    out.push({
      id: `dsp-${asset.id}`,
      date,
      ref: asset.ref.replace(/^AST/, 'LPS'),
      description: `Pelepasan aset tetap — ${asset.name}`,
      lines,
      source: 'disposal',
      assetId: asset.id,
      cfOverride: 'I',
      sort: asset.createdAt + 2,
    });
  }
  return out;
}

/* ───────── Buku jurnal lengkap (memoized) ───────── */

const cache = new WeakMap<AppData, { through: string; entries: JournalEntry[] }>();

export function buildJournal(data: AppData): JournalEntry[] {
  const through = endOfMonth(todayISO());
  const hit = cache.get(data);
  if (hit && hit.through === through) return hit.entries;
  const ctx = makeCtx(data);
  const entries: JournalEntry[] = [];
  for (const tx of data.transactions) {
    const e = journalizeTx(tx, ctx);
    if (e) entries.push(e);
  }
  const assetOrder = [...data.assets].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  assetOrder.forEach((a, i) => entries.push(...assetEntries(a, ctx, through, i + 1)));
  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.sort - b.sort || (a.id < b.id ? -1 : 1)));
  cache.set(data, { through, entries });
  return entries;
}

export function entryTotals(e: { lines: { debit: number; credit: number }[] }) {
  let d = 0;
  let c = 0;
  for (const l of e.lines) {
    d += l.debit;
    c += l.credit;
  }
  return { debit: round2(d), credit: round2(c), balanced: isZero(d - c) };
}

/* ───────── Saldo ───────── */

export interface DC {
  d: number;
  c: number;
}

export function sumByAccount(
  entries: JournalEntry[],
  opts: { from?: string; to?: string; exclude?: (e: JournalEntry) => boolean } = {},
): Map<string, DC> {
  const m = new Map<string, DC>();
  const { from, to, exclude } = opts;
  for (const e of entries) {
    if (from && e.date < from) continue;
    if (to && e.date > to) continue;
    if (exclude && exclude(e)) continue;
    for (const l of e.lines) {
      let x = m.get(l.accountId);
      if (!x) m.set(l.accountId, (x = { d: 0, c: 0 }));
      x.d += l.debit;
      x.c += l.credit;
    }
  }
  return m;
}

export function balanceOf(a: Account, m: Map<string, DC>): number {
  const x = m.get(a.id);
  if (!x) return 0;
  return round2(normalSide(a) === 'debit' ? x.d - x.c : x.c - x.d);
}
