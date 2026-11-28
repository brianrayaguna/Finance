/*
 * Mesin anggaran pengeluaran & pembayaran hutang.
 * Satu sumber kebenaran untuk realisasi anggaran, ringkasan anti hitung ganda,
 * rincian penyusun transaksi/jurnal, serta rata-rata 3 bulan aktif terakhir.
 */
import { addDays, addMonths, daysBetween, endOfMonth, formatDate, formatMoney, isZero, monthsBetween, round2, startOfMonth } from '../lib/format';
import { SYS, WALLET_SUBTYPES } from './coa';
import type {
  Account,
  AccountSubtype,
  Budget,
  BudgetKind,
  BudgetTarget,
  EntrySource,
  JournalEntry,
  Transaction,
} from './types';
import { activity, debtInfos, type Books, type DebtInfo } from './reports';

export type BudgetStatusCode = 'safe' | 'warn' | 'over';

/** Asal nominal anggaran satu bulan: anggaran khusus bulan itu, atau versi rutin yang berlaku. */
export type BudgetSource = 'month' | 'recurring';

export interface BudgetLineBase {
  key: string;
  target: BudgetTarget;
  kind: BudgetKind;
  /** Hanya untuk rentang dalam satu bulan kalender. */
  source?: BudgetSource;
  label: string;
  sublabel?: string;
  icon: string;
  color: string;
  sortCode: string;
  budget: number;
  actual: number;
  variance: number;
  used: number;
}

export interface ExpenseBudgetLine extends BudgetLineBase {
  kind: 'expense';
  categoryId: string;
  account: Account;
}

export interface DebtBudgetLine extends BudgetLineBase {
  kind: 'debt';
  debtId?: string;
  debt?: DebtInfo;
  isCreditPurchase: boolean;
  isPaidOff: boolean;
  activeInPeriod: boolean;
}

export type BudgetLine = ExpenseBudgetLine | DebtBudgetLine;

export interface BudgetSummary {
  expenseBudget: number;
  expenseActual: number;
  debtBudget: number;
  debtActual: number;
  totalBudget: number;
  totalActual: number;
  remaining: number;
  overCount: number;
  activeCount: number;
  hasExpense: boolean;
  hasDebt: boolean;
  specificExceedsAggregate: boolean;
}

export interface BudgetBreakdownItem {
  id: string;
  date: string;
  ref: string;
  title: string;
  subtitle: string;
  amount: number;
  principal?: number;
  interest?: number;
  isRefund?: boolean;
  tx?: Transaction;
  source: EntrySource;
  sort: number;
}

const DEBT_LIABILITY_SUBTYPES = new Set<AccountSubtype>(['payable', 'loan', 'long_term_liability']);
const WALLET_SUBTYPE_SET = new Set<AccountSubtype>(WALLET_SUBTYPES);

export function budgetStatus(used: number, pace: number): BudgetStatusCode {
  if (used > 1) return 'over';
  if (used > Math.max(0.85, pace + 0.1)) return 'warn';
  return 'safe';
}

export function budgetKind(b: Pick<Budget, 'kind'>): BudgetKind {
  return b.kind === 'debt' ? 'debt' : 'expense';
}

export function budgetTargetKey(b: Pick<Budget, 'kind' | 'categoryId' | 'debtId'>): string {
  if (budgetKind(b) === 'debt') return `debt:${b.debtId || 'all'}`;
  return `expense:${b.categoryId ?? ''}`;
}

export function budgetTargetOf(b: Pick<Budget, 'kind' | 'categoryId' | 'debtId'>): BudgetTarget {
  if (budgetKind(b) === 'debt') return b.debtId ? { kind: 'debt', debtId: b.debtId } : { kind: 'debt' };
  return { kind: 'expense', categoryId: b.categoryId ?? '' };
}

/**
 * Nominal anggaran satu target untuk bulan `month` (YYYY-MM): anggaran khusus bulan itu,
 * lalu versi rutin dengan `from` terbesar yang ≤ bulan itu (tanpa `from` = sejak awal). Null bila tidak ada.
 */
export function resolveBudgetAmount(
  budgets: Budget[],
  key: string,
  month: string,
): { amount: number; source: BudgetSource } | null {
  let special: Budget | undefined;
  let recurring: Budget | undefined;
  for (const bg of budgets) {
    if (budgetTargetKey(bg) !== key) continue;
    if (bg.month) {
      if (bg.month === month) special = bg;
      continue;
    }
    const from = bg.from ?? '';
    if (from > month) continue;
    if (!recurring || from >= (recurring.from ?? '')) recurring = bg;
  }
  if (special) return { amount: special.amount, source: 'month' };
  if (recurring) return { amount: recurring.amount, source: 'recurring' };
  return null;
}

/** Porsi tiap bulan kalender (0–1, menurut jumlah hari) yang tercakup rentang tanggal `from`–`to`. */
function monthPortions(from: string, to: string): { month: string; portion: number }[] {
  if (!from || !to || from > to) return [];
  return monthsBetween(from, to).map((m) => {
    const ms = `${m}-01`;
    const me = endOfMonth(ms);
    if (from <= ms && to >= me) return { month: m, portion: 1 };
    const dim = daysBetween(ms, me) + 1;
    const s = from > ms ? from : ms;
    const e = to < me ? to : me;
    return { month: m, portion: Math.max(0, daysBetween(s, e) + 1) / dim };
  });
}

export function prorateMonths(from: string, to: string): number {
  const total = monthPortions(from, to).reduce((sum, p) => sum + p.portion, 0);
  return total || 1;
}

/** Total anggaran satu target pada rentang `from`–`to`: nominal tiap bulan dikali porsi harinya. */
export function budgetAmountOver(budgets: Budget[], key: string, from: string, to: string): number {
  let total = 0;
  for (const { month, portion } of monthPortions(from, to)) {
    const r = resolveBudgetAmount(budgets, key, month);
    if (r) total += r.amount * portion;
  }
  return round2(total);
}

interface DebtContribution {
  amount: number;
  principal: number;
  interest: number;
}

function debtPaymentEntryContribution(
  b: Books,
  e: JournalEntry,
  txById: Map<string, Transaction>,
  debtId?: string,
): DebtContribution | null {
  if (e.txType === 'payable_pay') {
    const tx = e.txId ? txById.get(e.txId) : undefined;
    if (!tx) return null;
    if (debtId && tx.parentId !== debtId) return null;
    let principal = 0;
    let interest = 0;
    for (const l of e.lines) {
      if (!(l.debit > 0)) continue;
      if (l.accountId === SYS.interestExpense) interest += l.debit;
      else principal += l.debit;
    }
    const amount = round2(principal + interest);
    if (amount <= 0.005) return null;
    return { amount, principal: round2(principal), interest: round2(interest) };
  }

  // Entri non-payable_pay hanya dihitung pada anggaran agregat ("Semua pembayaran hutang")
  if (debtId) return null;

  let walletOut = 0;
  let debtDebit = 0;
  let interestDebit = 0;
  for (const l of e.lines) {
    const acc = b.acc.get(l.accountId);
    if (!acc) continue;
    if (WALLET_SUBTYPE_SET.has(acc.subtype)) walletOut += l.credit - l.debit;
    if (DEBT_LIABILITY_SUBTYPES.has(acc.subtype)) debtDebit += l.debit;
    if (acc.id === SYS.interestExpense) interestDebit += l.debit;
  }
  // Harus ada pelunasan pokok ke liabilitas hutang/pinjaman & dana keluar dari dompet;
  // beban bunga berdiri sendiri (debtDebit === 0) dan bayar tagihan kartu kredit otomatis terlewat.
  if (walletOut <= 0.005 || debtDebit <= 0.005) return null;
  const amount = round2(Math.min(walletOut, debtDebit + interestDebit));
  if (amount <= 0.005) return null;
  const principal = round2(Math.min(amount, debtDebit));
  const interest = round2(Math.max(0, amount - principal));
  return { amount, principal, interest };
}

function sumDebtActual(b: Books, txById: Map<string, Transaction>, from: string, actualTo: string, debtId?: string): number {
  let total = 0;
  for (const e of b.entries) {
    if (e.date < from) continue;
    if (e.date > actualTo) break;
    const c = debtPaymentEntryContribution(b, e, txById, debtId);
    if (c) total += c.amount;
  }
  return round2(total);
}

/** Apakah sebuah transaksi termasuk dalam anggaran pembayaran hutang (agregat atau per-hutang). */
export function matchesDebtPaymentBudget(b: Books, tx: Transaction, debtId?: string): boolean {
  const entry = b.entries.find((e) => e.txId === tx.id);
  if (!entry) return false;
  const txById = new Map(b.data.transactions.map((t) => [t.id, t]));
  return debtPaymentEntryContribution(b, entry, txById, debtId) !== null;
}

export function budgetVsActual(b: Books, from: string, to: string, actualTo = to): BudgetLine[] {
  const budgets = b.data.budgets;
  const singleMonth = from.slice(0, 7) === to.slice(0, 7) ? from.slice(0, 7) : null;
  const act = activity(b, from, actualTo);
  const txById = new Map(b.data.transactions.map((t) => [t.id, t]));
  const hasDebtBudget = b.data.budgets.some((bg) => bg.kind === 'debt');

  // Hitung info hutang sekali saja bila ada anggaran pembayaran hutang
  const debtAsOfMap = hasDebtBudget ? new Map(debtInfos(b.data, actualTo).map((d) => [d.tx.id, d])) : null;
  const debtBeforeMap = hasDebtBudget ? new Map(debtInfos(b.data, addDays(from, -1)).map((d) => [d.tx.id, d])) : null;
  const contactCount = new Map<string, number>();
  if (hasDebtBudget) {
    for (const t of b.data.transactions) {
      if (t.type !== 'payable_new') continue;
      const c = (t.contact ?? '').trim().toLowerCase();
      if (c) contactCount.set(c, (contactCount.get(c) ?? 0) + 1);
    }
  }

  const lines: BudgetLine[] = [];
  // Satu baris per target; nominal tiap bulan dipilih dari versi rutin / anggaran khusus yang berlaku.
  const targets = new Map<string, Budget>();
  for (const bg of budgets) if (!targets.has(budgetTargetKey(bg))) targets.set(budgetTargetKey(bg), bg);
  const sourceOf = (key: string) => (singleMonth ? resolveBudgetAmount(budgets, key, singleMonth)?.source : undefined);

  for (const [key, bg] of targets) {
    const target = budgetTargetOf(bg);
    if (bg.kind === 'debt') {
      if (bg.debtId) {
        const origin = txById.get(bg.debtId);
        if (!origin || origin.type !== 'payable_new') continue;
        // Sebelum hutang tercatat: jangan tampilkan anggaran hutang tersebut
        if (origin.date > to) continue;

        const actual = sumDebtActual(b, txById, from, actualTo, origin.id);
        const debtAsOf = debtAsOfMap?.get(origin.id);
        const debtBefore = debtBeforeMap?.get(origin.id);
        const isPaidOff = debtAsOf ? debtAsOf.remaining <= 0.005 : false;
        const paidBefore = debtBefore ? debtBefore.remaining <= 0.005 : false;
        const activeInPeriod = !(paidBefore && isZero(actual));

        // Prorasi rentang multi-bulan mulai dari bulan asal hutang hingga bulan pelunasan (bila lunas)
        let effFrom = from;
        if (origin.date > from) {
          const originMonthStart = startOfMonth(origin.date);
          if (originMonthStart > effFrom) effFrom = originMonthStart;
        }
        let effTo = to;
        if (isPaidOff && debtAsOf?.lastPayment) {
          const paidMonthEnd = endOfMonth(debtAsOf.lastPayment);
          if (paidMonthEnd < effTo && paidMonthEnd >= effFrom) effTo = paidMonthEnd;
        }
        const budget = activeInPeriod ? budgetAmountOver(budgets, key, effFrom, effTo) : budgetAmountOver(budgets, key, from, to);
        if (budget <= 0.005) continue;

        const rawContact = origin.contact?.trim() || 'Hutang';
        const dup = (contactCount.get(rawContact.toLowerCase()) ?? 0) > 1;
        const desc = origin.description?.trim();
        const label = dup && desc ? `${rawContact} — ${desc}` : rawContact;
        const sublabel = dup && desc ? formatDate(origin.date) : desc || formatDate(origin.date);

        lines.push({
          key,
          target,
          source: sourceOf(key),
          kind: 'debt',
          debtId: origin.id,
          debt: debtAsOf,
          isCreditPurchase: origin.counter === 'category',
          isPaidOff,
          activeInPeriod,
          label,
          sublabel,
          icon: 'handshake',
          color: 'var(--tone-payable)',
          sortCode: `9-${origin.date}-${origin.ref}`,
          budget,
          actual,
          variance: round2(budget - actual),
          used: budget ? actual / budget : 0,
        });
      } else {
        const budget = budgetAmountOver(budgets, key, from, to);
        if (budget <= 0.005) continue;
        const actual = sumDebtActual(b, txById, from, actualTo);
        lines.push({
          key,
          target,
          source: sourceOf(key),
          kind: 'debt',
          isCreditPurchase: false,
          isPaidOff: false,
          activeInPeriod: true,
          label: 'Semua pembayaran hutang',
          sublabel: 'Seluruh cicilan pokok & bunga bulanan',
          icon: 'handshake',
          color: 'var(--tone-payable)',
          sortCode: '9-0000',
          budget,
          actual,
          variance: round2(budget - actual),
          used: budget ? actual / budget : 0,
        });
      }
      continue;
    }

    if (!bg.categoryId) continue;
    const a = b.acc.get(bg.categoryId);
    if (!a) continue;
    const budget = budgetAmountOver(budgets, key, from, to);
    if (budget <= 0.005) continue;
    const x = act.get(a.id);
    const actual = round2(x ? x.d - x.c : 0);
    lines.push({
      key,
      target,
      source: sourceOf(key),
      kind: 'expense',
      categoryId: a.id,
      account: a,
      label: a.name,
      icon: a.icon,
      color: a.color,
      sortCode: a.code,
      budget,
      actual,
      variance: round2(budget - actual),
      used: budget ? actual / budget : 0,
    });
  }

  return lines.sort((x, y) => y.used - x.used);
}

/** Ringkasan total anggaran tanpa hitung ganda antara agregat hutang & per-hutang, dan mengecualikan hutang lunas tak aktif. */
export function budgetSummary(lines: BudgetLine[]): BudgetSummary {
  const active = lines.filter((l) => l.kind === 'expense' || l.activeInPeriod);
  const exp = active.filter((l): l is ExpenseBudgetLine => l.kind === 'expense');
  const debts = active.filter((l): l is DebtBudgetLine => l.kind === 'debt');
  const agg = debts.find((l) => !l.debtId);
  const specifics = debts.filter((l) => !!l.debtId);

  const expenseBudget = round2(exp.reduce((s, l) => s + l.budget, 0));
  const expenseActual = round2(exp.reduce((s, l) => s + l.actual, 0));
  const specificBudget = round2(specifics.reduce((s, l) => s + l.budget, 0));
  const debtBudget = agg ? agg.budget : specificBudget;
  const debtActual = agg ? agg.actual : round2(specifics.reduce((s, l) => s + l.actual, 0));
  const totalBudget = round2(expenseBudget + debtBudget);
  const totalActual = round2(expenseActual + debtActual);

  return {
    expenseBudget,
    expenseActual,
    debtBudget,
    debtActual,
    totalBudget,
    totalActual,
    remaining: round2(totalBudget - totalActual),
    overCount: active.filter((l) => l.used > 1).length,
    activeCount: active.length,
    hasExpense: exp.length > 0,
    hasDebt: debts.length > 0,
    specificExceedsAggregate: !!agg && specificBudget - agg.budget > 0.005,
  };
}

/** Rata-rata realisasi 3 bulan kalender sebelum `month` (YYYY-MM), dibagi hanya dengan bulan aktif (> 0). */
export function budgetThreeMonthAverage(
  b: Books,
  target: BudgetTarget,
  month: string,
): { average: number; activeMonths: number } {
  const txById = target.kind === 'debt' ? new Map(b.data.transactions.map((t) => [t.id, t])) : null;
  let sum = 0;
  let activeMonths = 0;

  for (const offset of [-3, -2, -1]) {
    const mFrom = startOfMonth(addMonths(`${month}-01`, offset));
    const mTo = endOfMonth(mFrom);
    let val = 0;
    if (target.kind === 'expense') {
      const x = activity(b, mFrom, mTo).get(target.categoryId);
      val = round2(x ? x.d - x.c : 0);
    } else {
      val = sumDebtActual(b, txById!, mFrom, mTo, target.debtId);
    }
    if (val > 0.005) {
      sum += val;
      activeMonths++;
    }
  }

  return {
    average: activeMonths > 0 ? round2(sum / activeMonths) : 0,
    activeMonths,
  };
}

/** Rincian entri penyusun realisasi anggaran dalam [from, actualTo] yang jumlahnya sama persis dengan `line.actual`. */
export function budgetBreakdown(b: Books, line: BudgetLine, from: string, actualTo: string): BudgetBreakdownItem[] {
  const txById = new Map(b.data.transactions.map((t) => [t.id, t]));
  const items: BudgetBreakdownItem[] = [];

  if (line.kind === 'expense') {
    for (const e of b.entries) {
      if (e.date < from) continue;
      if (e.date > actualTo) break;
      let impact = 0;
      for (const l of e.lines) {
        if (l.accountId === line.categoryId) impact += l.debit - l.credit;
      }
      impact = round2(impact);
      if (isZero(impact)) continue;

      const tx = e.txId ? txById.get(e.txId) : undefined;
      let subtitle = '';
      if (tx) {
        const wallet = tx.accountId ? b.acc.get(tx.accountId)?.name : undefined;
        if (tx.type === 'income') subtitle = wallet ? `Pengembalian dana · ${wallet}` : 'Pengembalian dana';
        else if (tx.type === 'payable_new' && tx.counter === 'category') subtitle = `Pembelian kredit · ${tx.contact || 'Hutang'}`;
        else if (tx.type === 'transfer') subtitle = wallet ? `Biaya transfer · ${wallet}` : 'Biaya transfer';
        else if (tx.type === 'payable_pay') {
          const parent = tx.parentId ? txById.get(tx.parentId) : undefined;
          subtitle = `Bunga hutang${parent?.contact ? ` · ${parent.contact}` : ''}`;
        } else if (tx.type === 'journal') subtitle = 'Jurnal umum';
        else subtitle = wallet ?? '';
      } else if (e.source === 'depreciation') {
        subtitle = 'Penyusutan otomatis';
      } else if (e.source === 'disposal') {
        subtitle = 'Pelepasan aset tetap';
      }

      items.push({
        id: e.id,
        date: e.date,
        ref: e.ref,
        title: e.description || line.label,
        subtitle,
        amount: impact,
        isRefund: impact < 0,
        tx,
        source: e.source,
        sort: e.sort,
      });
    }
  } else {
    for (const e of b.entries) {
      if (e.date < from) continue;
      if (e.date > actualTo) break;
      const contrib = debtPaymentEntryContribution(b, e, txById, line.debtId);
      if (!contrib) continue;

      const tx = e.txId ? txById.get(e.txId) : undefined;
      const wallet =
        (tx?.accountId ? b.acc.get(tx.accountId)?.name : undefined) ??
        e.lines
          .filter((l) => l.credit > 0 && WALLET_SUBTYPE_SET.has(b.acc.get(l.accountId)?.subtype as AccountSubtype))
          .map((l) => b.acc.get(l.accountId)?.name)
          .find(Boolean) ??
        '';
      const parts: string[] = [];
      if (contrib.interest > 0) parts.push(`Pokok ${formatMoney(contrib.principal)} · Bunga ${formatMoney(contrib.interest)}`);
      if (wallet) parts.push(wallet);

      items.push({
        id: e.id,
        date: e.date,
        ref: e.ref,
        title: e.description || 'Pembayaran hutang',
        subtitle: parts.join(' · '),
        amount: contrib.amount,
        principal: contrib.principal,
        interest: contrib.interest,
        tx,
        source: e.source,
        sort: e.sort,
      });
    }
  }

  return items.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : y.sort - x.sort));
}
