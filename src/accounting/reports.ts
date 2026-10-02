/*
 * Laporan keuangan yang diturunkan dari buku jurnal:
 * Laba Rugi, Neraca (Posisi Keuangan), Arus Kas (langsung + rekonsiliasi tidak langsung),
 * Perubahan Ekuitas, Neraca Saldo, Neraca Lajur, Jurnal Penutup, Rasio, Umur Hutang/Piutang, Anggaran.
 */
import {
  addDays,
  daysBetween,
  endOfMonth,
  fiscalYearStart,
  formatDate,
  formatMoney,
  isZero,
  monthsBetween,
  round2,
  todayISO,
  formatMonth,
  addMonths,
} from '../lib/format';
import { CASH_SUBTYPES, SUBTYPE_META, SYS, isPL, normalSide, sortAccounts } from './coa';
import { buildJournal, sumByAccount, type DC } from './engine';
import type {
  Account,
  AccountSubtype,
  AppData,
  CFClass,
  JournalEntry,
  Report,
  ReportColumn,
  ReportRow,
  Transaction,
} from './types';

/* ───────── Books ───────── */

export interface Books {
  data: AppData;
  entries: JournalEntry[];
  accounts: Account[];
  acc: Map<string, Account>;
  fyStartMonth: number;
  cashIds: Set<string>;
}

const booksCache = new WeakMap<AppData, Books>();

export function getBooks(data: AppData): Books {
  const entries = buildJournal(data);
  const hit = booksCache.get(data);
  if (hit && hit.entries === entries) return hit;
  const accounts = sortAccounts(data.accounts);
  const b: Books = {
    data,
    entries,
    accounts,
    acc: new Map(accounts.map((a) => [a.id, a])),
    fyStartMonth: data.profile.fiscalYearStartMonth || 1,
    cashIds: new Set(accounts.filter((a) => CASH_SUBTYPES.includes(a.subtype)).map((a) => a.id)),
  };
  booksCache.set(data, b);
  return b;
}

export const bal = (a: Account, m: Map<string, DC>) => {
  const x = m.get(a.id);
  if (!x) return 0;
  return round2(normalSide(a) === 'debit' ? x.d - x.c : x.c - x.d);
};

export function balancesAt(b: Books, to: string) {
  return sumByAccount(b.entries, { to });
}
export function activity(b: Books, from: string, to: string) {
  return sumByAccount(b.entries, { from, to });
}

/** Laba bersih periode: Σ(kredit − debit) seluruh akun pendapatan & beban. */
export function netIncome(b: Books, from: string | undefined, to: string): number {
  let v = 0;
  for (const e of b.entries) {
    if (from && e.date < from) continue;
    if (e.date > to) continue;
    for (const l of e.lines) {
      const a = b.acc.get(l.accountId);
      if (a && isPL(a)) v += l.credit - l.debit;
    }
  }
  return round2(v);
}

export function cashTotal(b: Books, to: string): number {
  const m = balancesAt(b, to);
  let v = 0;
  for (const a of b.accounts) if (b.cashIds.has(a.id)) v += bal(a, m);
  return round2(v);
}

export interface Position {
  assets: number;
  liabilities: number;
  equity: number;
  currentAssets: number;
  currentLiabilities: number;
  cash: number;
  quickAssets: number;
  receivables: number;
  netWorth: number;
}

export function positionAt(b: Books, to: string): Position {
  const m = balancesAt(b, to);
  let assets = 0;
  let liabilities = 0;
  let currentAssets = 0;
  let currentLiabilities = 0;
  let cash = 0;
  let receivables = 0;
  let quick = 0;
  for (const a of b.accounts) {
    const v = bal(a, m);
    if (isZero(v)) continue;
    const g = SUBTYPE_META[a.subtype].group;
    if (a.type === 'asset') {
      const sv = a.subtype === 'accum_depreciation' ? -v : v;
      assets += sv;
      if (g === 'Aset Lancar') currentAssets += sv;
      if (CASH_SUBTYPES.includes(a.subtype)) cash += sv;
      if (a.subtype === 'receivable') receivables += sv;
      if (CASH_SUBTYPES.includes(a.subtype) || a.subtype === 'receivable' || a.subtype === 'investment') quick += sv;
    } else if (a.type === 'liability') {
      liabilities += v;
      if (g === 'Liabilitas Jangka Pendek') currentLiabilities += v;
    }
  }
  const equity = round2(assets - liabilities);
  return {
    assets: round2(assets),
    liabilities: round2(liabilities),
    equity,
    currentAssets: round2(currentAssets),
    currentLiabilities: round2(currentLiabilities),
    cash: round2(cash),
    quickAssets: round2(quick),
    receivables: round2(receivables),
    netWorth: equity,
  };
}

/** Akun saldo laba utama (kode terkecil) — penampung laba ditahan tahun-tahun lalu. */
export function retainedTarget(b: Books): Account | undefined {
  return b.accounts.find((a) => a.subtype === 'retained_earnings');
}

/**
 * Saldo untuk tampilan daftar akun per tanggal: akun neraca kumulatif sejak awal,
 * akun laba rugi (nominal) hanya tahun buku berjalan — sesuai perlakuan setelah penutupan.
 */
export function displayBalances(b: Books, to: string): (a: Account) => number {
  const all = balancesAt(b, to);
  const fy = fiscalYearStart(to, b.fyStartMonth);
  const ytd = activity(b, fy, to);
  return (a: Account) => bal(a, isPL(a) ? ytd : all);
}

/* ───────── Helpers for report building ───────── */

export interface Period {
  from: string;
  to: string;
  label: string;
}

function valueColumns(periods: { label: string; sub?: string }[], compare: boolean): ReportColumn[] {
  const cols: ReportColumn[] = periods.map((p) => ({ label: p.label, sub: p.sub && p.sub !== p.label ? p.sub : undefined, kind: 'value' as const }));
  if (compare && periods.length >= 2) {
    cols.push({ label: 'Perubahan', kind: 'change', of: [0, 1] });
    cols.push({ label: '%', kind: 'percent', of: [0, 1] });
  }
  return cols;
}

function row(
  key: string,
  label: string,
  kind: ReportRow['kind'],
  values: (number | null)[],
  indent = 0,
  extra: Partial<ReportRow> = {},
): ReportRow {
  return { key, label, kind, values: values.map((v) => (v === null ? null : round2(v))), indent, ...extra };
}

const sumRows = (rows: ReportRow[], n: number) =>
  Array.from({ length: n }, (_, i) => rows.reduce((s, r) => s + (r.values[i] ?? 0), 0));

const nonZero = (vals: (number | null)[]) => vals.some((v) => v !== null && !isZero(v));

/* ───────── LAPORAN LABA RUGI ───────── */

export function incomeStatement(b: Books, periods: Period[], entityName: string): Report {
  const n = periods.length;
  const acts = periods.map((p) => activity(b, p.from, p.to));
  const plAccounts = b.accounts.filter((a) => isPL(a));
  const val = (a: Account) =>
    acts.map((m) => {
      const x = m.get(a.id);
      if (!x) return 0;
      return a.type === 'revenue' ? x.c - x.d : x.d - x.c;
    });
  const accRows = (sub: AccountSubtype[], indent = 1) =>
    plAccounts
      .filter((a) => sub.includes(a.subtype))
      .map((a) => ({ a, v: val(a) }))
      .filter((x) => nonZero(x.v))
      .map((x) => row('a-' + x.a.id, x.a.name, 'account', x.v, indent, { code: x.a.code, accountId: x.a.id }));

  const rows: ReportRow[] = [];
  const rev = accRows(['operating_revenue']);
  const cogs = accRows(['cogs']);
  const opex = accRows(['operating_expense']);
  const orev = accRows(['other_revenue'], 2);
  const oexp = accRows(['other_expense'], 2);

  const tRev = sumRows(rev, n);
  const tCogs = sumRows(cogs, n);
  const tOpex = sumRows(opex, n);
  const tORev = sumRows(orev, n);
  const tOExp = sumRows(oexp, n);

  rows.push(row('sec-rev', 'PENDAPATAN', 'section', Array(n).fill(null)));
  rows.push(...rev);
  rows.push(row('st-rev', 'Jumlah Pendapatan Utama', 'subtotal', tRev, 0, { formula: { plus: rev.map((r) => r.key) } }));
  rows.push(row('b1', '', 'blank', Array(n).fill(null)));

  let grossKey = 'st-rev';
  if (cogs.length) {
    rows.push(row('sec-cogs', 'HARGA POKOK PENJUALAN', 'section', Array(n).fill(null)));
    rows.push(...cogs);
    rows.push(row('st-cogs', 'Jumlah Harga Pokok Penjualan', 'subtotal', tCogs, 0, { formula: { plus: cogs.map((r) => r.key) } }));
    rows.push(
      row('t-gross', 'LABA KOTOR', 'total', tRev.map((v, i) => v - tCogs[i]), 0, {
        formula: { plus: ['st-rev'], minus: ['st-cogs'] },
      }),
    );
    rows.push(row('b2', '', 'blank', Array(n).fill(null)));
    grossKey = 't-gross';
  }

  rows.push(row('sec-opex', 'BEBAN OPERASIONAL', 'section', Array(n).fill(null)));
  rows.push(...opex);
  rows.push(row('st-opex', 'Jumlah Beban Operasional', 'subtotal', tOpex, 0, { formula: { plus: opex.map((r) => r.key) } }));
  rows.push(row('b3', '', 'blank', Array(n).fill(null)));

  const opInc = tRev.map((v, i) => v - tCogs[i] - tOpex[i]);
  rows.push(
    row('t-op', 'LABA (RUGI) OPERASIONAL', 'total', opInc, 0, { formula: { plus: [grossKey], minus: ['st-opex'] } }),
  );
  rows.push(row('b4', '', 'blank', Array(n).fill(null)));

  rows.push(row('sec-other', 'PENDAPATAN (BEBAN) LAIN-LAIN', 'section', Array(n).fill(null)));
  rows.push(row('g-orev', 'Pendapatan lain-lain', 'group', Array(n).fill(null), 1));
  rows.push(...(orev.length ? orev : [row('none-orev', 'Tidak ada', 'note', Array(n).fill(null), 2, { italic: true })]));
  rows.push(row('g-oexp', 'Beban lain-lain', 'group', Array(n).fill(null), 1));
  rows.push(...(oexp.length ? oexp : [row('none-oexp', 'Tidak ada', 'note', Array(n).fill(null), 2, { italic: true })]));
  const other = tORev.map((v, i) => v - tOExp[i]);
  rows.push(
    row('st-other', 'Jumlah Pendapatan (Beban) Lain-lain, Bersih', 'subtotal', other, 0, {
      formula: { plus: orev.map((r) => r.key), minus: oexp.map((r) => r.key) },
    }),
  );
  rows.push(row('b5', '', 'blank', Array(n).fill(null)));

  const net = opInc.map((v, i) => v + other[i]);
  rows.push(row('t-net', 'LABA (RUGI) BERSIH', 'grandtotal', net, 0, { formula: { plus: ['t-op', 'st-other'] } }));

  // cross-check with direct computation
  const checks = periods.map((p, i) => {
    const d = netIncome(b, p.from, p.to);
    return { label: `Laba bersih ${p.label} sesuai buku besar`, ok: isZero(d - net[i]), diff: round2(d - net[i]) };
  });

  const revTotal = tRev.map((v, i) => v + tORev[i]);
  const margin = net.map((v, i) => (revTotal[i] ? v / revTotal[i] : 0));

  return {
    id: 'income-statement',
    title: 'Laporan Laba Rugi',
    subtitle: `${entityName} · Untuk periode ${periods[0].label}`,
    columns: valueColumns(periods.map((p) => (n > 1 ? { label: p.label, sub: `${formatDate(p.from)} – ${formatDate(p.to)}` } : { label: `${formatDate(p.from)} – ${formatDate(p.to)}` })), n > 1),
    rows,
    checks,
    notes: [
      `Margin laba bersih: ${(margin[0] * 100).toFixed(1).replace('.', ',')}%`,
      'Dasar pencatatan: pemasukan dan pengeluaran harian diakui saat uang diterima/dibayar; penyusutan, piutang, dan hutang kredit diakui secara akrual; bunga pinjaman diakui saat dibayar.',
    ],
  };
}

/* ───────── LAPORAN POSISI KEUANGAN (NERACA) ───────── */

export function balanceSheet(b: Books, dates: { to: string; label: string }[], entityName: string): Report {
  const n = dates.length;
  const maps = dates.map((d) => balancesAt(b, d.to));
  const fyStarts = dates.map((d) => fiscalYearStart(d.to, b.fyStartMonth));
  const valOf = (a: Account) =>
    maps.map((m) => {
      const v = bal(a, m);
      return a.subtype === 'accum_depreciation' || a.subtype === 'drawing' ? -v : v;
    });
  const accRows = (sub: AccountSubtype[], indent = 2) =>
    b.accounts
      .filter((a) => sub.includes(a.subtype))
      .map((a) => ({ a, v: valOf(a) }))
      .filter((x) => nonZero(x.v))
      .map((x) => row('a-' + x.a.id, x.a.name, 'account', x.v, indent, { code: x.a.code, accountId: x.a.id }));

  const rows: ReportRow[] = [];
  const empty = Array(n).fill(null);

  rows.push(row('sec-assets', 'ASET', 'section', empty));
  rows.push(row('g-ca', 'Aset Lancar', 'group', empty, 1));
  const ca = accRows(['cash', 'bank', 'ewallet', 'investment', 'receivable', 'prepaid', 'other_current_asset']);
  rows.push(...ca);
  const tCa = sumRows(ca, n);
  rows.push(row('st-ca', 'Jumlah Aset Lancar', 'subtotal', tCa, 1, { formula: { plus: ca.map((r) => r.key) } }));
  rows.push(row('g-nca', 'Aset Tidak Lancar', 'group', empty, 1));
  const nca = accRows(['fixed_asset', 'accum_depreciation', 'other_asset']);
  rows.push(...nca);
  const tNca = sumRows(nca, n);
  rows.push(row('st-nca', 'Jumlah Aset Tidak Lancar', 'subtotal', tNca, 1, { formula: { plus: nca.map((r) => r.key) } }));
  const tAssets = tCa.map((v, i) => v + tNca[i]);
  rows.push(row('t-assets', 'JUMLAH ASET', 'grandtotal', tAssets, 0, { formula: { plus: ['st-ca', 'st-nca'] } }));
  rows.push(row('b1', '', 'blank', empty));

  rows.push(row('sec-le', 'LIABILITAS DAN EKUITAS', 'section', empty));
  rows.push(row('g-cl', 'Liabilitas Jangka Pendek', 'group', empty, 1));
  const cl = accRows(['credit_card', 'payable', 'accrued', 'loan', 'other_current_liability']);
  rows.push(...cl);
  const tCl = sumRows(cl, n);
  rows.push(row('st-cl', 'Jumlah Liabilitas Jangka Pendek', 'subtotal', tCl, 1, { formula: { plus: cl.map((r) => r.key) } }));
  rows.push(row('g-ncl', 'Liabilitas Jangka Panjang', 'group', empty, 1));
  const ncl = accRows(['long_term_liability']);
  rows.push(...ncl);
  const tNcl = sumRows(ncl, n);
  rows.push(row('st-ncl', 'Jumlah Liabilitas Jangka Panjang', 'subtotal', tNcl, 1, { formula: { plus: ncl.map((r) => r.key) } }));
  const tLiab = tCl.map((v, i) => v + tNcl[i]);
  rows.push(row('t-liab', 'JUMLAH LIABILITAS', 'total', tLiab, 0, { formula: { plus: ['st-cl', 'st-ncl'] } }));
  rows.push(row('b2', '', 'blank', empty));

  rows.push(row('g-eq', 'Ekuitas', 'group', empty, 1));
  const eqA = accRows(['capital', 'opening_equity', 'drawing']);
  rows.push(...eqA);
  const retainedAcc = b.accounts.filter((a) => a.subtype === 'retained_earnings' || a.subtype === 'income_summary');
  const retained = dates.map((_, i) => {
    const prior = netIncome(b, undefined, addDays(fyStarts[i], -1));
    const direct = retainedAcc.reduce((s, a) => s + bal(a, maps[i]), 0);
    return prior + direct;
  });
  const current = dates.map((d, i) => netIncome(b, fyStarts[i], d.to));
  const reRow = row('eq-re', 'Saldo Laba', 'account', retained, 2);
  const cyRow = row('eq-cy', 'Laba (Rugi) Tahun Berjalan', 'account', current, 2);
  rows.push(reRow, cyRow);
  const eqRows = [...eqA, reRow, cyRow];
  const tEq = sumRows(eqRows, n);
  rows.push(row('t-eq', 'JUMLAH EKUITAS', 'total', tEq, 0, { formula: { plus: eqRows.map((r) => r.key) } }));
  rows.push(row('b3', '', 'blank', empty));
  const tLe = tLiab.map((v, i) => v + tEq[i]);
  rows.push(row('t-le', 'JUMLAH LIABILITAS DAN EKUITAS', 'grandtotal', tLe, 0, { formula: { plus: ['t-liab', 't-eq'] } }));

  const checks = dates.map((d, i) => ({
    label: `Aset = Liabilitas + Ekuitas per ${formatDate(d.to, 'long')}`,
    ok: isZero(tAssets[i] - tLe[i]),
    diff: round2(tAssets[i] - tLe[i]),
  }));

  return {
    id: 'balance-sheet',
    title: 'Laporan Posisi Keuangan (Neraca)',
    subtitle: `${entityName} · Per ${formatDate(dates[0].to, 'long')}`,
    columns: valueColumns(dates.map((d) => ({ label: n > 1 ? d.label : `Per ${formatDate(d.to)}` })), n > 1),
    rows,
    checks,
  };
}

/* ───────── LAPORAN ARUS KAS ───────── */

interface CFCore {
  begin: number;
  /** Saldo awal kas/rekening yang baru dibukukan di dalam periode (bukan arus kas, bukan bagian kas awal) */
  opened: number;
  end: number;
  net: number;
  flows: Record<CFClass, Map<string, { label: string; value: number; order: number }>>;
  ni: number;
  adj: Map<string, { label: string; value: number; order: number }>;
  wc: Map<string, { label: string; value: number; order: number }>;
  nonCash: { date: string; ref: string; description: string; amount: number }[];
}

function cfLabel(a: Account, cls: CFClass, inflow: boolean): { key: string; label: string; order: number } {
  const n = a.name;
  const k = `${cls}:${inflow ? 'in' : 'out'}:${a.id}`;
  const o = inflow ? 0 : 1000;
  const code = Number(a.code.replace(/\D/g, '')) || 0;
  const mk = (label: string) => ({ key: k, label, order: o + code / 100000 });
  if (a.type === 'revenue') return mk(inflow ? `Penerimaan dari ${n.toLowerCase()}` : `Pengembalian ${n.toLowerCase()}`);
  if (a.type === 'expense') return mk(inflow ? `Pengembalian ${n.toLowerCase()}` : `Pembayaran ${n.toLowerCase()}`);
  switch (a.subtype) {
    case 'receivable':
      if (cls === 'I') return mk(inflow ? `Penerimaan kembali pinjaman yang diberikan` : `Pemberian pinjaman kepada pihak lain`);
      return mk(inflow ? `Penerimaan pelunasan ${n.toLowerCase()}` : `Kenaikan ${n.toLowerCase()}`);
    case 'payable':
      if (cls === 'F') return mk(inflow ? `Penerimaan pinjaman` : `Pembayaran pokok pinjaman`);
      return mk(inflow ? `Penerimaan ${n.toLowerCase()}` : `Pembayaran ${n.toLowerCase()} usaha`);
    case 'credit_card':
      if (cls === 'F') return mk(inflow ? `Pencairan tunai ${n}` : `Pelunasan pencairan tunai ${n}`);
      return mk(inflow ? `Penerimaan melalui ${n}` : `Pembayaran tagihan ${n}`);
    case 'investment':
      return mk(inflow ? `Pencairan ${n}` : `Penempatan ${n}`);
    case 'fixed_asset':
    case 'other_asset':
      return mk(inflow ? `Penerimaan dari ${n.toLowerCase()}` : `Perolehan ${n.toLowerCase()}`);
    case 'capital':
      return mk(inflow ? `Setoran modal pemilik` : `Penarikan modal pemilik`);
    case 'drawing':
      return mk(inflow ? `Pengembalian prive` : `Pengambilan prive pemilik`);
    default:
      return mk(inflow ? `Penerimaan — ${n}` : `Pembayaran — ${n}`);
  }
}

function cashFlowCore(b: Books, from: string, to: string): CFCore {
  const flows: CFCore['flows'] = { O: new Map(), I: new Map(), F: new Map() };
  const adj: CFCore['adj'] = new Map();
  const wc: CFCore['wc'] = new Map();
  const nonCash: CFCore['nonCash'] = [];
  const beforeMap = sumByAccount(b.entries, { to: addDays(from, -1) });
  let begin = 0;
  let opened = 0;
  for (const a of b.accounts) if (b.cashIds.has(a.id)) begin += bal(a, beforeMap);
  let ni = 0;

  const add = (m: Map<string, { label: string; value: number; order: number }>, key: string, label: string, v: number, order: number) => {
    const x = m.get(key);
    if (x) x.value += v;
    else m.set(key, { label, value: v, order });
  };

  for (const e of b.entries) {
    if (e.date < from || e.date > to) continue;
    let delta = 0;
    for (const l of e.lines) if (b.cashIds.has(l.accountId)) delta += l.debit - l.credit;
    delta = round2(delta);
    // Saldo awal yang dibukukan di tengah periode (mis. rekening baru) bukan arus kas, dan juga bukan kas awal
    // per tanggal awal periode — ditampilkan sebagai baris terpisah agar kas awal tetap sama dengan neraca.
    if (e.opening) {
      // saldo awal bertanggal tepat di hari pertama periode = kas awal; yang bertanggal sesudahnya = baris terpisah
      if (e.date === from) begin += delta;
      else opened += delta;
      continue;
    }
    const nonCashLines = e.lines.filter((l) => !b.cashIds.has(l.accountId));
    const clsOf = (l: (typeof e.lines)[number]): CFClass => {
      const a = b.acc.get(l.accountId);
      const def = a ? SUBTYPE_META[a.subtype]?.cf ?? 'O' : 'O';
      return e.cfOverride ?? l.cf ?? (def === 'cash' ? 'O' : def);
    };
    const isCashEntry = !isZero(delta);
    const mixed = !isCashEntry && nonCashLines.some((l) => clsOf(l) !== 'O');

    // P&L → laba bersih
    for (const l of e.lines) {
      const a = b.acc.get(l.accountId);
      if (a && isPL(a)) ni += l.credit - l.debit;
    }

    // Metode langsung
    if (isCashEntry) {
      if (e.source === 'disposal') {
        add(flows.I, 'I:disposal', 'Penerimaan dari pelepasan aset tetap', delta, 500);
      } else {
        for (const l of nonCashLines) {
          const a = b.acc.get(l.accountId);
          if (!a) continue;
          const v = l.credit - l.debit;
          if (isZero(v)) continue;
          const cls = clsOf(l);
          const lab = cfLabel(a, cls, v > 0);
          add(flows[cls], lab.key, lab.label, v, lab.order);
        }
      }
    } else if (mixed) {
      const amt = nonCashLines.reduce((s, l) => s + l.debit, 0);
      nonCash.push({ date: e.date, ref: e.ref, description: e.description, amount: round2(amt) });
    }

    // Rekonsiliasi metode tidak langsung
    for (const l of nonCashLines) {
      const a = b.acc.get(l.accountId);
      if (!a) continue;
      const v = l.credit - l.debit;
      if (isZero(v)) continue;
      const cls = clsOf(l);
      const code = Number(a.code.replace(/\D/g, '')) || 0;
      if (isPL(a)) {
        if (cls !== 'O') {
          add(adj, 'nonop:' + a.id, v > 0 ? `Laba atas ${a.name.toLowerCase()}` : `${a.name}`, -v, 2 + code / 1e6);
        } else if (mixed) {
          add(adj, 'noncash:' + a.id, `${a.name} (non-kas)`, -v, 3 + code / 1e6);
        }
      } else if (cls === 'O' && !mixed) {
        if (a.subtype === 'accum_depreciation') add(adj, 'dep', 'Beban penyusutan aset tetap', v, 1);
        else {
          const label =
            a.type === 'asset' ? `(Kenaikan) penurunan ${a.name.toLowerCase()}` : `Kenaikan (penurunan) ${a.name.toLowerCase()}`;
          add(wc, a.id, label, v, code);
        }
      }
    }
  }

  const end = cashTotal(b, to);
  const net = [...flows.O.values(), ...flows.I.values(), ...flows.F.values()].reduce((s, x) => s + x.value, 0);
  for (const m of [flows.O, flows.I, flows.F, adj, wc])
    for (const [k, x] of m) {
      x.value = round2(x.value);
      if (isZero(x.value)) m.delete(k);
    }
  return { begin: round2(begin), opened: round2(opened), end, net: round2(net), flows, ni: round2(ni), adj, wc, nonCash };
}

export function cashFlowStatement(b: Books, periods: Period[], entityName: string): Report {
  const n = periods.length;
  const cores = periods.map((p) => cashFlowCore(b, p.from, p.to));
  const empty = Array(n).fill(null);
  const rows: ReportRow[] = [];

  const mapRows = (pick: (c: CFCore) => Map<string, { label: string; value: number; order: number }>, prefix: string, indent = 1) => {
    const keys = new Map<string, { label: string; order: number }>();
    cores.forEach((c) => pick(c).forEach((x, k) => keys.set(k, { label: x.label, order: x.order })));
    return [...keys.entries()]
      .sort((a, b2) => a[1].order - b2[1].order)
      .map(([k, meta]) => row(`${prefix}-${k}`, meta.label, 'account', cores.map((c) => pick(c).get(k)?.value ?? 0), indent));
  };

  const section = (cls: CFClass, title: string, totalLabel: string, key: string) => {
    rows.push(row('sec-' + key, title, 'section', empty));
    const r = mapRows((c) => c.flows[cls], key);
    if (!r.length) rows.push(row('none-' + key, 'Tidak ada arus kas', 'note', empty, 1, { italic: true }));
    rows.push(...r);
    const t = sumRows(r, n);
    rows.push(row('st-' + key, totalLabel, 'subtotal', t, 0, { formula: { plus: r.map((x) => x.key) } }));
    rows.push(row('b-' + key, '', 'blank', empty));
    return t;
  };

  const tO = section('O', 'ARUS KAS DARI AKTIVITAS OPERASI', 'Kas Bersih dari Aktivitas Operasi', 'op');
  const tI = section('I', 'ARUS KAS DARI AKTIVITAS INVESTASI', 'Kas Bersih dari Aktivitas Investasi', 'inv');
  const tF = section('F', 'ARUS KAS DARI AKTIVITAS PENDANAAN', 'Kas Bersih dari Aktivitas Pendanaan', 'fin');

  const net = tO.map((v, i) => v + tI[i] + tF[i]);
  rows.push(row('t-net', 'KENAIKAN (PENURUNAN) BERSIH KAS DAN SETARA KAS', 'total', net, 0, { formula: { plus: ['st-op', 'st-inv', 'st-fin'] } }));
  rows.push(row('t-begin', 'Kas dan setara kas awal periode', 'account', cores.map((c) => c.begin), 0));
  const hasOpened = cores.some((c) => !isZero(c.opened));
  if (hasOpened) rows.push(row('t-open', 'Saldo awal kas/rekening yang dibukukan dalam periode', 'account', cores.map((c) => c.opened), 0));
  rows.push(
    row('t-end', 'KAS DAN SETARA KAS AKHIR PERIODE', 'grandtotal', net.map((v, i) => v + cores[i].begin + cores[i].opened), 0, {
      formula: { plus: ['t-net', 't-begin', ...(hasOpened ? ['t-open'] : [])] },
    }),
  );
  rows.push(row('b-x', '', 'blank', empty));

  // Rekonsiliasi (metode tidak langsung)
  rows.push(row('sec-ind', 'REKONSILIASI LABA BERSIH KE KAS DARI AKTIVITAS OPERASI', 'section', empty));
  rows.push(row('ind-ni', 'Laba (rugi) bersih', 'account', cores.map((c) => c.ni), 1));
  rows.push(row('g-adj', 'Penyesuaian pos non-kas dan non-operasi:', 'group', empty, 1));
  const adjRows = mapRows((c) => c.adj, 'adj', 2);
  if (!adjRows.length) rows.push(row('none-adj', 'Tidak ada', 'note', empty, 2, { italic: true }));
  rows.push(...adjRows);
  rows.push(row('g-wc', 'Perubahan aset dan liabilitas operasi:', 'group', empty, 1));
  const wcRows = mapRows((c) => c.wc, 'wc', 2);
  if (!wcRows.length) rows.push(row('none-wc', 'Tidak ada', 'note', empty, 2, { italic: true }));
  rows.push(...wcRows);
  const ind = cores.map((c, i) => c.ni + adjRows.reduce((s, r) => s + (r.values[i] ?? 0), 0) + wcRows.reduce((s, r) => s + (r.values[i] ?? 0), 0));
  rows.push(
    row('ind-total', 'Kas Bersih dari Aktivitas Operasi (Metode Tidak Langsung)', 'subtotal', ind, 0, {
      formula: { plus: ['ind-ni', ...adjRows.map((r) => r.key), ...wcRows.map((r) => r.key)] },
    }),
  );

  const checks = periods.flatMap((p, i) => [
    {
      label: `Kas akhir sesuai saldo buku besar (${p.label})`,
      ok: isZero(cores[i].begin + cores[i].opened + net[i] - cores[i].end),
      diff: round2(cores[i].begin + cores[i].opened + net[i] - cores[i].end),
    },
    {
      label: `Metode langsung = metode tidak langsung (${p.label})`,
      ok: isZero(ind[i] - tO[i]),
      diff: round2(ind[i] - tO[i]),
    },
  ]);

  const notes: string[] = [];
  if (cores[0].nonCash.length) {
    notes.push('Aktivitas investasi dan pendanaan yang tidak memengaruhi kas:');
    for (const x of cores[0].nonCash) notes.push(`${formatDate(x.date)} · ${x.ref} · ${x.description} · ${formatMoney(x.amount)}`);
  }

  return {
    id: 'cash-flow',
    title: 'Laporan Arus Kas',
    subtitle: `${entityName} · Untuk periode ${periods[0].label}`,
    columns: valueColumns(periods.map((p) => (n > 1 ? { label: p.label, sub: `${formatDate(p.from)} – ${formatDate(p.to)}` } : { label: `${formatDate(p.from)} – ${formatDate(p.to)}` })), n > 1),
    rows,
    checks,
    notes,
  };
}

/* ───────── LAPORAN PERUBAHAN EKUITAS ───────── */

export function equityStatement(b: Books, p: Period, entityName: string): Report {
  const before = addDays(p.from, -1);
  const mB = balancesAt(b, before);
  const act = activity(b, p.from, p.to);
  const sum = (sub: AccountSubtype[], m: Map<string, DC>) =>
    b.accounts.filter((a) => sub.includes(a.subtype)).reduce((s, a) => s + bal(a, m), 0);
  const actSum = (sub: AccountSubtype[]) =>
    b.accounts
      .filter((a) => sub.includes(a.subtype))
      .reduce((s, a) => {
        const x = act.get(a.id);
        return s + (x ? x.c - x.d : 0);
      }, 0);

  const beginCap = sum(['capital'], mB);
  const beginOpe = sum(['opening_equity'], mB);
  const beginDraw = -sum(['drawing'], mB);
  const beginRe = netIncome(b, undefined, before) + sum(['retained_earnings', 'income_summary'], mB);

  const capMove = actSum(['capital']);
  const opeMove = actSum(['opening_equity']);
  const drawMove = actSum(['drawing']); // kredit − debit ⇒ negatif bila prive diambil
  const reAdj = actSum(['retained_earnings', 'income_summary']);
  const ni = netIncome(b, p.from, p.to);

  const r = (key: string, label: string, v: [number, number, number, number], kind: ReportRow['kind'] = 'account', indent = 0) =>
    row(key, label, kind, [...v, v[0] + v[1] + v[2] + v[3]], indent, { rowSumColumns: true });

  const rows: ReportRow[] = [];
  const begin = r('eq-begin', `Saldo per ${formatDate(before, 'long')}`, [beginCap, beginOpe, beginDraw, beginRe], 'subtotal');
  rows.push(begin);
  const moves: ReportRow[] = [];
  moves.push(r('eq-cap', 'Setoran (penarikan) modal', [capMove, 0, 0, 0], 'account', 1));
  moves.push(r('eq-ope', 'Pengakuan ekuitas saldo awal', [0, opeMove, 0, 0], 'account', 1));
  moves.push(r('eq-ni', 'Laba (rugi) bersih periode berjalan', [0, 0, 0, ni], 'account', 1));
  moves.push(r('eq-draw', 'Pengambilan prive', [0, 0, drawMove, 0], 'account', 1));
  if (!isZero(reAdj)) moves.push(r('eq-readj', 'Penyesuaian saldo laba', [0, 0, 0, reAdj], 'account', 1));
  rows.push(...moves);
  const endVals: [number, number, number, number] = [
    beginCap + capMove,
    beginOpe + opeMove,
    beginDraw + drawMove,
    beginRe + ni + reAdj,
  ];
  rows.push(
    row('eq-end', `Saldo per ${formatDate(p.to, 'long')}`, 'grandtotal', [...endVals, endVals.reduce((s, v) => s + v, 0)], 0, {
      formula: { plus: ['eq-begin', ...moves.map((m) => m.key)] },
      rowSumColumns: true,
    }),
  );

  const eqEnd = positionAt(b, p.to).equity;
  const total = endVals.reduce((s, v) => s + v, 0);
  return {
    id: 'equity',
    title: 'Laporan Perubahan Ekuitas',
    subtitle: `${entityName} · Untuk periode ${p.label}`,
    columns: [
      { label: 'Modal Pemilik', kind: 'value' },
      { label: 'Ekuitas Saldo Awal', kind: 'value' },
      { label: 'Prive', kind: 'value' },
      { label: 'Saldo Laba', kind: 'value' },
      { label: 'Jumlah Ekuitas', kind: 'value' },
    ],
    rows,
    checks: [{ label: 'Saldo akhir ekuitas sesuai Neraca', ok: isZero(total - eqEnd), diff: round2(total - eqEnd) }],
  };
}

/* ───────── NERACA SALDO ───────── */

export function trialBalance(b: Books, to: string, entityName: string): Report {
  const fy = fiscalYearStart(to, b.fyStartMonth);
  const m = balancesAt(b, to);
  const mPrior = balancesAt(b, addDays(fy, -1));
  const priorNI = netIncome(b, undefined, addDays(fy, -1));
  // Laba tahun-tahun lalu digabung ke SATU akun saldo laba (kode terkecil) — tidak ke setiap akun
  // bersubjenis saldo laba, dan tidak disuntikkan dua kali bila saldo akun itu kebetulan nol.
  const reTarget = retainedTarget(b);
  const rows: ReportRow[] = [];
  let td = 0;
  let tc = 0;
  const accRows: ReportRow[] = [];
  for (const a of b.accounts) {
    let x = m.get(a.id) ?? { d: 0, c: 0 };
    if (isPL(a)) {
      const p = mPrior.get(a.id) ?? { d: 0, c: 0 };
      x = { d: x.d - p.d, c: x.c - p.c };
    }
    let net = x.d - x.c;
    if (reTarget && a.id === reTarget.id) net -= priorNI;
    net = round2(net);
    if (isZero(net)) continue;
    const d = net > 0 ? net : 0;
    const c = net < 0 ? -net : 0;
    td += d;
    tc += c;
    accRows.push(row('a-' + a.id, a.name, 'account', [d, c], 0, { code: a.code, accountId: a.id }));
  }
  if (!reTarget && !isZero(priorNI)) {
    const d = priorNI < 0 ? -priorNI : 0;
    const c = priorNI > 0 ? priorNI : 0;
    td += d;
    tc += c;
    accRows.push(row('a-re', 'Saldo Laba', 'account', [d, c], 0, { code: '3-2000' }));
    accRows.sort((x, y) => (x.code ?? '').localeCompare(y.code ?? '', 'en', { numeric: true }));
  }
  rows.push(...accRows);
  rows.push(row('t-tb', 'JUMLAH', 'grandtotal', [td, tc], 0, { formula: { plus: accRows.map((r) => r.key) } }));
  return {
    id: 'trial-balance',
    title: 'Neraca Saldo',
    subtitle: `${entityName} · Per ${formatDate(to, 'long')}`,
    columns: [
      { label: 'Debit', kind: 'value' },
      { label: 'Kredit', kind: 'value' },
    ],
    rows,
    checks: [{ label: 'Total debit = total kredit', ok: isZero(td - tc), diff: round2(td - tc) }],
  };
}

/* ───────── NERACA LAJUR (KERTAS KERJA) ───────── */

export function worksheet(b: Books, p: Period, entityName: string): Report {
  const isAdj = (e: JournalEntry) => !!e.adjusting && e.date >= p.from && e.date <= p.to;
  const mUnadj = sumByAccount(b.entries, { to: p.to, exclude: isAdj });
  const mPrior = sumByAccount(b.entries, { to: addDays(p.from, -1) });
  const mAdj = sumByAccount(b.entries.filter(isAdj));
  const priorNI = netIncome(b, undefined, addDays(p.from, -1));
  const reTarget = retainedTarget(b);

  const rows: ReportRow[] = [];
  const tot = Array(10).fill(0) as number[];
  const split = (v: number): [number, number] => (v > 0 ? [v, 0] : [0, -v]);

  for (const a of b.accounts) {
    let u = mUnadj.get(a.id) ?? { d: 0, c: 0 };
    if (isPL(a)) {
      const pr = mPrior.get(a.id) ?? { d: 0, c: 0 };
      u = { d: u.d - pr.d, c: u.c - pr.c };
    }
    let uNet = u.d - u.c;
    if (reTarget && a.id === reTarget.id) uNet -= priorNI;
    uNet = round2(uNet);
    const ad = mAdj.get(a.id) ?? { d: 0, c: 0 };
    const adjD = round2(ad.d);
    const adjC = round2(ad.c);
    const aNet = round2(uNet + adjD - adjC);
    if (isZero(uNet) && isZero(adjD) && isZero(adjC)) continue;
    const [nsD, nsK] = split(uNet);
    const [nsdD, nsdK] = split(aNet);
    const pl = isPL(a);
    const vals = [nsD, nsK, adjD, adjC, nsdD, nsdK, pl ? nsdD : 0, pl ? nsdK : 0, pl ? 0 : nsdD, pl ? 0 : nsdK];
    vals.forEach((v, i) => (tot[i] += v));
    rows.push(row('a-' + a.id, a.name, 'account', vals, 0, { code: a.code, accountId: a.id }));
  }
  if (!reTarget && !isZero(priorNI)) {
    const [d, c] = split(-priorNI);
    const vals = [d, c, 0, 0, d, c, 0, 0, d, c];
    vals.forEach((v, i) => (tot[i] += v));
    rows.push(row('a-re', 'Saldo Laba', 'account', vals, 0, { code: '3-2000' }));
  }
  const accKeys = rows.map((r) => r.key);
  rows.push(row('t-sum', 'JUMLAH', 'total', tot, 0, { formula: { plus: accKeys } }));
  const ni = round2(tot[7] - tot[6]);
  const niRow = [0, 0, 0, 0, 0, 0, ni > 0 ? ni : 0, ni < 0 ? -ni : 0, ni < 0 ? -ni : 0, ni > 0 ? ni : 0];
  rows.push(row('t-ni', ni >= 0 ? 'Laba Bersih' : 'Rugi Bersih', 'account', niRow.map((v) => v || null), 0, { italic: true }));
  rows.push(
    row('t-final', 'JUMLAH SETELAH LABA (RUGI)', 'grandtotal', tot.map((v, i) => v + niRow[i]), 0, {
      formula: { plus: ['t-sum', 't-ni'] },
    }),
  );
  const f = tot.map((v, i) => v + niRow[i]);
  return {
    id: 'worksheet',
    title: 'Neraca Lajur',
    subtitle: `${entityName} · Untuk periode ${p.label}`,
    columns: [
      { label: 'Neraca Saldo', sub: 'Debit' },
      { label: 'Neraca Saldo', sub: 'Kredit' },
      { label: 'Penyesuaian', sub: 'Debit' },
      { label: 'Penyesuaian', sub: 'Kredit' },
      { label: 'NS Disesuaikan', sub: 'Debit' },
      { label: 'NS Disesuaikan', sub: 'Kredit' },
      { label: 'Laba Rugi', sub: 'Debit' },
      { label: 'Laba Rugi', sub: 'Kredit' },
      { label: 'Neraca', sub: 'Debit' },
      { label: 'Neraca', sub: 'Kredit' },
    ].map((c) => ({ ...c, kind: 'value' as const })),
    rows,
    checks: [
      { label: 'Neraca saldo seimbang', ok: isZero(tot[0] - tot[1]), diff: round2(tot[0] - tot[1]) },
      { label: 'Penyesuaian seimbang', ok: isZero(tot[2] - tot[3]), diff: round2(tot[2] - tot[3]) },
      { label: 'Kolom neraca seimbang setelah laba', ok: isZero(f[8] - f[9]), diff: round2(f[8] - f[9]) },
    ],
  };
}

/* ───────── JURNAL PENUTUP ───────── */

export interface ClosingLine {
  accountId?: string;
  name: string;
  code?: string;
  debit: number;
  credit: number;
}
export interface ClosingEntry {
  no: number;
  title: string;
  lines: ClosingLine[];
}

export function closingEntries(b: Books, p: Period): ClosingEntry[] {
  const act = activity(b, p.from, p.to);
  const summary = b.accounts.find((a) => a.subtype === 'income_summary');
  const re = b.accounts.find((a) => a.subtype === 'retained_earnings');
  const drawing = b.accounts.filter((a) => a.subtype === 'drawing');
  const capital = b.accounts.find((a) => a.subtype === 'capital');
  const sName = summary?.name ?? 'Ikhtisar Laba Rugi';
  const out: ClosingEntry[] = [];

  const revs = b.accounts
    .filter((a) => a.type === 'revenue')
    .map((a) => ({ a, v: round2((act.get(a.id)?.c ?? 0) - (act.get(a.id)?.d ?? 0)) }))
    .filter((x) => !isZero(x.v));
  const exps = b.accounts
    .filter((a) => a.type === 'expense')
    .map((a) => ({ a, v: round2((act.get(a.id)?.d ?? 0) - (act.get(a.id)?.c ?? 0)) }))
    .filter((x) => !isZero(x.v));
  const tRev = round2(revs.reduce((s, x) => s + x.v, 0));
  const tExp = round2(exps.reduce((s, x) => s + x.v, 0));

  if (revs.length)
    out.push({
      no: 1,
      title: 'Menutup akun pendapatan',
      lines: [
        ...revs.map((x) => ({ accountId: x.a.id, name: x.a.name, code: x.a.code, debit: x.v > 0 ? x.v : 0, credit: x.v < 0 ? -x.v : 0 })),
        { accountId: summary?.id, name: sName, code: summary?.code, debit: tRev < 0 ? -tRev : 0, credit: tRev > 0 ? tRev : 0 },
      ],
    });
  if (exps.length)
    out.push({
      no: 2,
      title: 'Menutup akun beban',
      lines: [
        { accountId: summary?.id, name: sName, code: summary?.code, debit: tExp > 0 ? tExp : 0, credit: tExp < 0 ? -tExp : 0 },
        ...exps.map((x) => ({ accountId: x.a.id, name: x.a.name, code: x.a.code, debit: x.v < 0 ? -x.v : 0, credit: x.v > 0 ? x.v : 0 })),
      ],
    });
  const ni = round2(tRev - tExp);
  if (!isZero(ni))
    out.push({
      no: 3,
      title: ni > 0 ? 'Memindahkan laba bersih ke saldo laba' : 'Memindahkan rugi bersih ke saldo laba',
      lines:
        ni > 0
          ? [
              { accountId: summary?.id, name: sName, code: summary?.code, debit: ni, credit: 0 },
              { accountId: re?.id, name: re?.name ?? 'Saldo Laba', code: re?.code, debit: 0, credit: ni },
            ]
          : [
              { accountId: re?.id, name: re?.name ?? 'Saldo Laba', code: re?.code, debit: -ni, credit: 0 },
              { accountId: summary?.id, name: sName, code: summary?.code, debit: 0, credit: -ni },
            ],
    });
  // Setiap akun prive ditutup sebesar saldonya sendiri (bukan total seluruh prive per akun).
  const draws = drawing
    .map((a) => ({ a, v: round2((act.get(a.id)?.d ?? 0) - (act.get(a.id)?.c ?? 0)) }))
    .filter((x) => !isZero(x.v));
  const drawTotal = round2(draws.reduce((s, x) => s + x.v, 0));
  if (draws.length && !isZero(drawTotal) && capital)
    out.push({
      no: 4,
      title: 'Menutup akun prive ke modal',
      lines: [
        { accountId: capital.id, name: capital.name, code: capital.code, debit: drawTotal > 0 ? drawTotal : 0, credit: drawTotal < 0 ? -drawTotal : 0 },
        ...draws.map(({ a, v }) => ({ accountId: a.id, name: a.name, code: a.code, debit: v < 0 ? -v : 0, credit: v > 0 ? v : 0 })),
      ],
    });
  return out.map((e, i) => ({ ...e, no: i + 1 }));
}

/* ───────── BUKU BESAR ───────── */

export interface LedgerRow {
  date: string;
  ref: string;
  description: string;
  memo?: string;
  debit: number;
  credit: number;
  balance: number;
  entryId: string;
  txId?: string;
  counter: string;
}

export interface LedgerView {
  account: Account;
  opening: number;
  rows: LedgerRow[];
  totalDebit: number;
  totalCredit: number;
  closing: number;
}

export function ledger(b: Books, accountId: string, from: string, to: string): LedgerView | null {
  const a = b.acc.get(accountId);
  if (!a) return null;
  const debitNormal = normalSide(a) === 'debit';
  const openFrom = isPL(a) ? fiscalYearStart(from, b.fyStartMonth) : undefined;
  let opening = 0;
  const rows: LedgerRow[] = [];
  let td = 0;
  let tc = 0;
  for (const e of b.entries) {
    if (e.date > to) break;
    for (const l of e.lines) {
      if (l.accountId !== accountId) continue;
      const delta = debitNormal ? l.debit - l.credit : l.credit - l.debit;
      if (e.date < from) {
        if (!openFrom || e.date >= openFrom) opening += delta;
        continue;
      }
      td += l.debit;
      tc += l.credit;
      const others = e.lines.filter((x) => x.accountId !== accountId).map((x) => b.acc.get(x.accountId)?.name ?? '');
      rows.push({
        date: e.date,
        ref: e.ref,
        description: e.description,
        memo: l.memo,
        debit: l.debit,
        credit: l.credit,
        balance: 0,
        entryId: e.id,
        txId: e.txId,
        counter: [...new Set(others)].join(', '),
      });
    }
  }
  let run = round2(opening);
  for (const r of rows) {
    run = round2(run + (debitNormal ? r.debit - r.credit : r.credit - r.debit));
    r.balance = run;
  }
  return { account: a, opening: round2(opening), rows, totalDebit: round2(td), totalCredit: round2(tc), closing: run };
}

/* ───────── HUTANG & PIUTANG (buku pembantu) ───────── */

export type DebtStatus = 'paid' | 'overdue' | 'due_soon' | 'active';

export interface DebtInfo {
  tx: Transaction;
  kind: 'payable' | 'receivable';
  paid: number;
  interest: number;
  writtenOff: number;
  remaining: number;
  payments: Transaction[];
  status: DebtStatus;
  daysToDue: number | null;
  lastPayment?: string;
}

export function debtInfos(data: AppData, asOf = todayISO()): DebtInfo[] {
  const children = new Map<string, Transaction[]>();
  for (const t of data.transactions) {
    if (t.parentId && (t.type === 'payable_pay' || t.type === 'receivable_collect' || t.type === 'receivable_writeoff')) {
      if (t.date > asOf) continue;
      const arr = children.get(t.parentId) ?? [];
      arr.push(t);
      children.set(t.parentId, arr);
    }
  }
  const out: DebtInfo[] = [];
  for (const t of data.transactions) {
    if (t.type !== 'payable_new' && t.type !== 'receivable_new') continue;
    if (t.date > asOf) continue;
    const pays = (children.get(t.id) ?? []).sort((a, b) => (a.date < b.date ? -1 : 1));
    const paid = round2(pays.filter((p) => p.type !== 'receivable_writeoff').reduce((s, p) => s + p.amount, 0));
    const interest = round2(pays.reduce((s, p) => s + (p.interest || 0), 0));
    const writtenOff = round2(pays.filter((p) => p.type === 'receivable_writeoff').reduce((s, p) => s + p.amount, 0));
    const remaining = round2(t.amount - paid - writtenOff);
    const daysToDue = t.dueDate ? daysBetween(asOf, t.dueDate) : null;
    let status: DebtStatus = 'active';
    if (remaining <= 0.005) status = 'paid';
    else if (daysToDue !== null && daysToDue < 0) status = 'overdue';
    else if (daysToDue !== null && daysToDue <= 7) status = 'due_soon';
    out.push({
      tx: t,
      kind: t.type === 'payable_new' ? 'payable' : 'receivable',
      paid,
      interest,
      writtenOff,
      remaining: Math.max(0, remaining),
      payments: pays,
      status,
      daysToDue,
      lastPayment: pays.length ? pays[pays.length - 1].date : undefined,
    });
  }
  return out.sort((a, b) => {
    const rank = (s: DebtStatus) => ({ overdue: 0, due_soon: 1, active: 2, paid: 3 })[s];
    return rank(a.status) - rank(b.status) || (a.tx.dueDate ?? '9999').localeCompare(b.tx.dueDate ?? '9999');
  });
}

export const AGING_BUCKETS = ['Belum jatuh tempo', '1–30 hari', '31–60 hari', '61–90 hari', '> 90 hari'];

export function agingReport(data: AppData, kind: 'payable' | 'receivable', asOf: string, entityName: string): Report {
  const list = debtInfos(data, asOf).filter((d) => d.kind === kind && d.remaining > 0.005);
  const rows: ReportRow[] = [];
  const tot = Array(6).fill(0) as number[];
  for (const d of list) {
    const b = Array(5).fill(0) as number[];
    const over = d.daysToDue === null ? 0 : -d.daysToDue;
    const idx = over <= 0 ? 0 : over <= 30 ? 1 : over <= 60 ? 2 : over <= 90 ? 3 : 4;
    b[idx] = d.remaining;
    const vals = [d.remaining, ...b];
    vals.forEach((v, i) => (tot[i] += v));
    rows.push(
      row('d-' + d.tx.id, `${d.tx.contact || '—'} · ${d.tx.description || ''}`.trim(), 'account', vals, 0, {
        code: d.tx.dueDate ? formatDate(d.tx.dueDate, 'short') : 'Tanpa JT',
      }),
    );
  }
  rows.push(row('t-aging', 'JUMLAH', 'grandtotal', tot, 0, { formula: { plus: rows.map((r) => r.key) } }));
  const pct = tot.slice(1).map((v) => (tot[0] ? v / tot[0] : 0));
  rows.push(row('t-pct', 'Persentase terhadap total', 'note', [null, ...pct.map((v) => round2(v * 100))], 0, { italic: true, unit: 'pct' }));
  return {
    id: kind === 'receivable' ? 'aging-ar' : 'aging-ap',
    title: kind === 'receivable' ? 'Analisis Umur Piutang' : 'Analisis Umur Hutang',
    subtitle: `${entityName} · Per ${formatDate(asOf, 'long')}`,
    columns: [
      { label: 'Sisa Saldo', kind: 'value' },
      ...AGING_BUCKETS.map((l) => ({ label: l, kind: 'value' as const })),
    ],
    rows,
  };
}

/* ───────── ANGGARAN ───────── */

export interface BudgetLine {
  budgetId?: string;
  account: Account;
  budget: number;
  actual: number;
  variance: number;
  used: number;
}

export function budgetVsActual(b: Books, from: string, to: string): BudgetLine[] {
  const months = monthsBetween(from, to).length || 1;
  const act = activity(b, from, to);
  const lines: BudgetLine[] = [];
  const budgeted = new Set<string>();
  for (const bg of b.data.budgets) {
    const a = b.acc.get(bg.categoryId);
    if (!a) continue;
    budgeted.add(a.id);
    const x = act.get(a.id);
    const actual = round2(x ? x.d - x.c : 0);
    const budget = round2(bg.amount * months);
    lines.push({ budgetId: bg.id, account: a, budget, actual, variance: round2(budget - actual), used: budget ? actual / budget : 0 });
  }
  return lines.sort((x, y) => y.used - x.used);
}

export function budgetReport(b: Books, p: Period, entityName: string): Report {
  const lines = budgetVsActual(b, p.from, p.to).sort((x, y) => x.account.code.localeCompare(y.account.code, 'en', { numeric: true }));
  const budgeted = new Set(lines.map((l) => l.account.id));
  const act = activity(b, p.from, p.to);
  const extra = b.accounts
    .filter((a) => a.type === 'expense' && !budgeted.has(a.id))
    .map((a) => ({ a, v: round2((act.get(a.id)?.d ?? 0) - (act.get(a.id)?.c ?? 0)) }))
    .filter((x) => !isZero(x.v));
  const rows: ReportRow[] = [];
  rows.push(row('sec-b', 'KATEGORI BERANGGARAN', 'section', [null, null, null, null]));
  const bRows = lines.map((l) =>
    row('a-' + l.account.id, l.account.name, 'account', [l.budget, l.actual, l.variance, round2(l.used * 100)], 1, {
      code: l.account.code,
      accountId: l.account.id,
    }),
  );
  rows.push(...bRows);
  const tb = bRows.reduce((s, r) => s + (r.values[0] ?? 0), 0);
  const ta = bRows.reduce((s, r) => s + (r.values[1] ?? 0), 0);
  rows.push(row('st-b', 'Jumlah Beranggaran', 'subtotal', [tb, ta, tb - ta, tb ? round2((ta / tb) * 100) : 0], 0));
  if (extra.length) {
    rows.push(row('b1', '', 'blank', [null, null, null, null]));
    rows.push(row('sec-u', 'TANPA ANGGARAN', 'section', [null, null, null, null]));
    const uRows = extra.map((x) => row('u-' + x.a.id, x.a.name, 'account', [0, x.v, -x.v, null], 1, { code: x.a.code }));
    rows.push(...uRows);
    const tu = uRows.reduce((s, r) => s + (r.values[1] ?? 0), 0);
    rows.push(row('st-u', 'Jumlah Tanpa Anggaran', 'subtotal', [0, tu, -tu, null], 0));
    rows.push(row('t-all', 'JUMLAH BEBAN', 'grandtotal', [tb, ta + tu, tb - ta - tu, tb ? round2(((ta + tu) / tb) * 100) : null], 0));
  }
  return {
    id: 'budget',
    title: 'Laporan Anggaran vs Realisasi',
    subtitle: `${entityName} · Untuk periode ${p.label}`,
    columns: [
      { label: 'Anggaran', kind: 'value' },
      { label: 'Realisasi', kind: 'value' },
      { label: 'Selisih', kind: 'value' },
      { label: 'Terpakai', kind: 'value', unit: 'pct' },
    ],
    rows,
  };
}

/* ───────── RASIO KEUANGAN ───────── */

export interface Ratio {
  group: string;
  name: string;
  value: number | null;
  unit: 'x' | '%' | 'bulan';
  formula: string;
  benchmark: string;
  status: 'good' | 'warn' | 'bad' | 'na';
}

export function ratios(b: Books, p: Period): Ratio[] {
  const pos = positionAt(b, p.to);
  const act = activity(b, p.from, p.to);
  let revenue = 0;
  let opRevenue = 0;
  let expense = 0;
  let opExpense = 0;
  let cashOpExpense = 0;
  let interest = 0;
  // Beban non-kas tidak ikut menghitung kebutuhan dana darurat bulanan.
  const nonCash = new Set<string>([SYS.depreciationExpense, SYS.badDebt, SYS.lossDisposal]);
  for (const a of b.accounts) {
    const x = act.get(a.id);
    if (!x) continue;
    if (a.type === 'revenue') {
      revenue += x.c - x.d;
      if (a.subtype === 'operating_revenue') opRevenue += x.c - x.d;
    }
    if (a.type === 'expense') {
      expense += x.d - x.c;
      if (a.subtype === 'operating_expense' || a.subtype === 'cogs') {
        opExpense += x.d - x.c;
        if (!nonCash.has(a.id)) cashOpExpense += x.d - x.c;
      }
      if (a.id === SYS.interestExpense) interest += x.d - x.c;
    }
  }
  const ni = revenue - expense;
  const days = Math.max(1, daysBetween(p.from, p.to) + 1);
  // Rasio berbasis aset/ekuitas memakai laba yang disetahunkan agar acuan tahunan tetap bermakna
  // untuk periode pendek (mis. satu bulan).
  const annual = 365 / days;
  const avgMonthlyExp = cashOpExpense / Math.max(1, days / (365 / 12));

  // debt service = pokok + bunga yang dibayar dalam periode
  let debtService = 0;
  for (const t of b.data.transactions) {
    if (t.type === 'payable_pay' && t.date >= p.from && t.date <= p.to) debtService += t.amount + (t.interest || 0);
  }

  const div = (a: number, c: number) => (Math.abs(c) < 0.005 ? null : a / c);
  const st = (v: number | null, good: (x: number) => boolean, warn: (x: number) => boolean): Ratio['status'] =>
    v === null ? 'na' : good(v) ? 'good' : warn(v) ? 'warn' : 'bad';

  const cr = div(pos.currentAssets, pos.currentLiabilities);
  const qr = div(pos.quickAssets, pos.currentLiabilities);
  const cashR = div(pos.cash, pos.currentLiabilities);
  const dar = div(pos.liabilities, pos.assets);
  const der = div(pos.liabilities, pos.equity);
  const npm = div(ni, revenue);
  const opm = div(opRevenue - opExpense, opRevenue);
  const roa = div(ni * annual, pos.assets);
  const roe = pos.equity > 0 ? div(ni * annual, pos.equity) : null;
  const tie = interest > 0.005 ? div(ni + interest, interest) : null;
  const saving = div(ni, revenue);
  const emergency = div(pos.cash, avgMonthlyExp);
  const dsr = div(debtService, revenue);
  const liquidity = div(pos.cash, pos.netWorth);

  return [
    { group: 'Likuiditas', name: 'Rasio Lancar', value: cr, unit: 'x', formula: 'Aset Lancar ÷ Liabilitas Jangka Pendek', benchmark: '≥ 1,5x', status: st(cr, (x) => x >= 1.5, (x) => x >= 1) },
    { group: 'Likuiditas', name: 'Rasio Cepat', value: qr, unit: 'x', formula: '(Kas + Piutang + Investasi) ÷ Liabilitas Jangka Pendek', benchmark: '≥ 1x', status: st(qr, (x) => x >= 1, (x) => x >= 0.7) },
    { group: 'Likuiditas', name: 'Rasio Kas', value: cashR, unit: 'x', formula: 'Kas & Setara Kas ÷ Liabilitas Jangka Pendek', benchmark: '≥ 0,5x', status: st(cashR, (x) => x >= 0.5, (x) => x >= 0.2) },
    { group: 'Solvabilitas', name: 'Rasio Hutang terhadap Aset', value: dar, unit: '%', formula: 'Total Liabilitas ÷ Total Aset', benchmark: '≤ 40%', status: st(dar, (x) => x <= 0.4, (x) => x <= 0.6) },
    { group: 'Solvabilitas', name: 'Rasio Hutang terhadap Ekuitas', value: der, unit: 'x', formula: 'Total Liabilitas ÷ Total Ekuitas', benchmark: '≤ 1x', status: st(der, (x) => x >= 0 && x <= 1, (x) => x >= 0 && x <= 2) },
    { group: 'Solvabilitas', name: 'Cakupan Bunga (TIE)', value: tie, unit: 'x', formula: '(Laba Bersih + Beban Bunga) ÷ Beban Bunga', benchmark: '≥ 3x', status: st(tie, (x) => x >= 3, (x) => x >= 1.5) },
    { group: 'Solvabilitas', name: 'Rasio Pembayaran Hutang (DSR)', value: dsr, unit: '%', formula: '(Pokok + Bunga Dibayar) ÷ Total Pendapatan', benchmark: '≤ 30%', status: st(dsr, (x) => x <= 0.3, (x) => x <= 0.4) },
    { group: 'Profitabilitas', name: 'Margin Laba Bersih', value: npm, unit: '%', formula: 'Laba Bersih ÷ Total Pendapatan', benchmark: '≥ 20%', status: st(npm, (x) => x >= 0.2, (x) => x >= 0.05) },
    { group: 'Profitabilitas', name: 'Margin Operasional', value: opm, unit: '%', formula: '(Pendapatan Utama − Beban Operasional) ÷ Pendapatan Utama', benchmark: '≥ 20%', status: st(opm, (x) => x >= 0.2, (x) => x >= 0.05) },
    { group: 'Profitabilitas', name: 'Imbal Hasil Aset (ROA)', value: roa, unit: '%', formula: 'Laba Bersih disetahunkan ÷ Total Aset', benchmark: '≥ 5% per tahun', status: st(roa, (x) => x >= 0.05, (x) => x >= 0) },
    { group: 'Profitabilitas', name: 'Imbal Hasil Ekuitas (ROE)', value: roe, unit: '%', formula: 'Laba Bersih disetahunkan ÷ Total Ekuitas', benchmark: '≥ 10% per tahun', status: st(roe, (x) => x >= 0.1, (x) => x >= 0) },
    { group: 'Kesehatan Keuangan', name: 'Tingkat Tabungan', value: saving, unit: '%', formula: '(Pendapatan − Beban) ÷ Pendapatan', benchmark: '≥ 20%', status: st(saving, (x) => x >= 0.2, (x) => x >= 0.1) },
    { group: 'Kesehatan Keuangan', name: 'Cakupan Dana Darurat', value: emergency, unit: 'bulan', formula: 'Kas & Setara Kas ÷ Rata-rata Beban Operasional Tunai per Bulan', benchmark: '≥ 6 bulan', status: st(emergency, (x) => x >= 6, (x) => x >= 3) },
    { group: 'Kesehatan Keuangan', name: 'Rasio Likuiditas Kekayaan', value: liquidity, unit: '%', formula: 'Kas & Setara Kas ÷ Kekayaan Bersih', benchmark: '≥ 15%', status: st(liquidity, (x) => x >= 0.15, (x) => x >= 0.05) },
  ];
}

/* ───────── Seri untuk dasbor ───────── */

export interface MonthPoint {
  month: string;
  label: string;
  income: number;
  expense: number;
  net: number;
  /** Bulan ini belum selesai (akhir bulan setelah hari ini) — angkanya belum sebanding dengan bulan penuh */
  partial: boolean;
  netWorth: number;
  cash: number;
  assets: number;
  liabilities: number;
  receivables: number;
  investments: number;
}

/** Pendapatan, beban, dan laba bersih (akrual) pada satu rentang tanggal. */
export function periodFlow(b: Books, from: string, to: string) {
  const act = activity(b, from, to);
  let income = 0;
  let expense = 0;
  for (const a of b.accounts) {
    const x = act.get(a.id);
    if (!x) continue;
    if (a.type === 'revenue') income += x.c - x.d;
    else if (a.type === 'expense') expense += x.d - x.c;
  }
  return { income: round2(income), expense: round2(expense), net: round2(income - expense) };
}

export function monthlySeries(b: Books, endMonth: string, count: number, today = todayISO()): MonthPoint[] {
  const out: MonthPoint[] = [];
  const endDate = endOfMonth(endMonth + '-01');
  const months = monthsBetween(addMonths(endMonth + '-01', -(count - 1)), endDate).slice(-count);
  for (const m of months) {
    const from = m + '-01';
    const monthEnd = endOfMonth(from);
    // Bulan berjalan dihitung sampai hari ini: jurnal bertanggal akhir bulan (mis. penyusutan) yang belum tiba
    // tidak ikut, sehingga angkanya sebanding dengan periode yang sama bulan lalu dan dengan posisi hari ini.
    const to = monthEnd > today ? today : monthEnd;
    const flow = periodFlow(b, from, to);
    const pos = positionAt(b, to);
    out.push({
      month: m,
      label: formatMonth(m, true).replace(/ \d{4}$/, ''),
      ...flow,
      partial: monthEnd > today,
      netWorth: pos.netWorth,
      cash: pos.cash,
      assets: pos.assets,
      liabilities: pos.liabilities,
      receivables: pos.receivables,
      investments: round2(pos.quickAssets - pos.cash - pos.receivables),
    });
  }
  return out;
}

export function categoryBreakdown(b: Books, from: string, to: string, type: 'expense' | 'revenue') {
  const act = activity(b, from, to);
  const list = b.accounts
    .filter((a) => a.type === type)
    .map((a) => {
      const x = act.get(a.id);
      const v = x ? (type === 'expense' ? x.d - x.c : x.c - x.d) : 0;
      return { account: a, value: round2(v) };
    })
    .filter((x) => x.value > 0.005)
    .sort((x, y) => y.value - x.value);
  const total = list.reduce((s, x) => s + x.value, 0);
  return { list: list.map((x) => ({ ...x, share: total ? x.value / total : 0 })), total: round2(total) };
}

export function walletBalances(b: Books, to = todayISO()) {
  const m = balancesAt(b, to);
  return b.accounts
    .filter((a) => ['cash', 'bank', 'ewallet', 'investment', 'credit_card'].includes(a.subtype))
    .map((a) => ({ account: a, balance: bal(a, m) }));
}

export interface CashDay {
  date: string;
  /** Saldo kas & setara kas (kas, bank, e-wallet) pada akhir hari */
  balance: number;
  inflow: number;
  outflow: number;
}

/** Saldo kas harian beserta arus masuk/keluar per hari (transfer antar dompet saling hapus). */
export function cashSeries(b: Books, days: number, to = todayISO()): CashDay[] {
  const from = addDays(to, -days + 1);
  let run = 0;
  const flows = new Map<string, number>();
  for (const e of b.entries) {
    if (e.date > to) break;
    let d = 0;
    for (const l of e.lines) if (b.cashIds.has(l.accountId)) d += l.debit - l.credit;
    if (isZero(d)) continue;
    if (e.date < from) run += d;
    else flows.set(e.date, (flows.get(e.date) ?? 0) + d);
  }
  const out: CashDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const f = round2(flows.get(date) ?? 0);
    run += f;
    out.push({ date, balance: round2(run), inflow: f > 0 ? f : 0, outflow: f < 0 ? -f : 0 });
  }
  return out;
}

/** Total beban per tanggal (basis akrual) dalam rentang — untuk peta panas kalender. */
export function dailyExpense(b: Books, from: string, to: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of b.entries) {
    if (e.date < from) continue;
    if (e.date > to) break;
    let v = 0;
    for (const l of e.lines) if (b.acc.get(l.accountId)?.type === 'expense') v += l.debit - l.credit;
    if (!isZero(v)) out.set(e.date, round2((out.get(e.date) ?? 0) + v));
  }
  return out;
}

export function accountBalanceSeries(b: Books, accountId: string, days: number, to = todayISO()) {
  const a = b.acc.get(accountId);
  if (!a) return [];
  const from = addDays(to, -days + 1);
  const debitNormal = normalSide(a) === 'debit';
  let run = 0;
  const daily = new Map<string, number>();
  for (const e of b.entries) {
    if (e.date > to) break;
    for (const l of e.lines) {
      if (l.accountId !== accountId) continue;
      const d = debitNormal ? l.debit - l.credit : l.credit - l.debit;
      if (e.date < from) run += d;
      else daily.set(e.date, (daily.get(e.date) ?? 0) + d);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    run += daily.get(d) ?? 0;
    out.push(round2(run));
  }
  return out;
}
