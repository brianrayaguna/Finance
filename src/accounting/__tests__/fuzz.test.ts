/*
 * Uji acak (property test): ratusan buku dengan transaksi, hutang-piutang, jurnal manual, aset (termasuk
 * yang tidak disusutkan), refund, dan tarik tunai kartu. Pada setiap tanggal/periode, semua kontrol
 * keseimbangan laporan harus lolos.
 */
import { describe, expect, it } from 'vitest';
import { emptyData } from '../../store/data';
import { SUBTYPE_META } from '../coa';
import { buildJournal, entryTotals } from '../engine';
import { balanceSheet, cashFlowStatement, equityStatement, getBooks, incomeStatement, positionAt, trialBalance, worksheet } from '../reports';
import { addDays } from '../../lib/format';
import type { Account, AppData, FixedAsset, Transaction } from '../types';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function build(seed: number): AppData {
  const r = rng(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const d = emptyData();
  d.profile.fiscalYearStartMonth = 1 + Math.floor(r() * 12);
  const mk = (id: string, code: string, subtype: Account['subtype']): Account => ({ id, code, name: id, type: SUBTYPE_META[subtype].type, subtype, icon: 'wallet', color: '#000', createdAt: 1 });
  d.accounts.push(mk('w-bank', '1-1200', 'bank'), mk('w-ew', '1-1300', 'ewallet'), mk('w-inv', '1-1400', 'investment'), mk('w-cc', '2-1200', 'credit_card'), mk('acc-accrued2', '2-1310', 'accrued'));
  const wallets = ['acc-cash', 'w-bank', 'w-ew', 'w-inv', 'w-cc'];
  const cashish = ['acc-cash', 'w-bank', 'w-ew'];
  const rev = ['acc-salary', 'acc-bonus', 'acc-gift-income'];
  const exp = ['acc-food', 'acc-transport', 'acc-housing', 'acc-utilities'];
  const date = () => {
    const m = Math.floor(r() * 21);
    return `${2025 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`;
  };
  let n = 0;
  const base = () => ({ id: 'tx' + ++n, ref: 'R' + n, createdAt: n, updatedAt: n, description: '' });
  const txs: Transaction[] = [];
  const amt = () => Math.round((r() * 2_000_000 + 1000) * 100) / 100;
  for (const w of wallets) txs.push({ ...base(), type: 'opening', date: r() < 0.5 ? '2025-01-01' : date(), amount: w === 'w-cc' ? 500000 : 5_000_000, accountId: w });
  const N = 60 + Math.floor(r() * 60);
  for (let i = 0; i < N; i++) {
    const t = r();
    if (t < 0.2) txs.push({ ...base(), type: 'income', date: date(), amount: amt(), accountId: pick(cashish), categoryId: pick(rev) });
    else if (t < 0.28) txs.push({ ...base(), type: 'income', date: date(), amount: amt(), accountId: pick(cashish), categoryId: pick(exp) }); // refund
    else if (t < 0.5) txs.push({ ...base(), type: 'expense', date: date(), amount: amt(), accountId: pick(wallets), categoryId: pick(exp) });
    else if (t < 0.62) txs.push({ ...base(), type: 'transfer', date: date(), amount: amt(), accountId: pick(wallets), toAccountId: pick(wallets), fee: r() < 0.4 ? 2500 : 0 });
    else if (t < 0.72) {
      const o = { ...base(), type: 'payable_new' as const, date: date(), amount: amt() * 3, accountId: pick(cashish), categoryId: pick(exp), counter: pick(['wallet', 'category', 'opening'] as const) };
      txs.push(o);
      for (let j = 0, k = Math.floor(r() * 3); j < k; j++) txs.push({ ...base(), type: 'payable_pay', date: addDays(o.date, 5 + j * 20), amount: Math.min(o.amount / 4, 100000), parentId: o.id, accountId: pick(cashish), interest: r() < 0.5 ? 1000 : 0 });
    } else if (t < 0.82) {
      const o = { ...base(), type: 'receivable_new' as const, date: date(), amount: amt() * 2, accountId: pick(cashish), categoryId: pick(rev), counter: pick(['wallet', 'category', 'opening'] as const) };
      txs.push(o);
      for (let j = 0, k = Math.floor(r() * 3); j < k; j++) txs.push({ ...base(), type: r() < 0.3 ? 'receivable_writeoff' : 'receivable_collect', date: addDays(o.date, 3 + j * 25), amount: Math.min(o.amount / 5, 90000), parentId: o.id, accountId: pick(cashish), interest: r() < 0.3 ? 500 : 0 });
    } else if (t < 0.9) {
      const x = amt();
      txs.push({ ...base(), type: 'journal', date: date(), amount: x, adjusting: r() < 0.5, lines: [{ accountId: pick(exp), debit: x, credit: 0 }, { accountId: 'acc-accrued2', debit: 0, credit: x }] });
    } else {
      const x = amt();
      txs.push({ ...base(), type: 'journal', date: date(), amount: x, lines: [{ accountId: 'acc-prepaid', debit: x, credit: 0 }, { accountId: pick(cashish), debit: 0, credit: x }] });
    }
  }
  d.transactions = txs;
  for (let i = 0, na = Math.floor(r() * 3); i < na; i++) {
    const cost = Math.round(r() * 20_000_000 + 1_000_000);
    const a: FixedAsset = {
      id: 'a' + i, name: 'A' + i, accountId: pick(['acc-equipment', 'acc-vehicle', 'acc-building']), acquisitionDate: date(), cost,
      residualValue: Math.round(cost * r() * 0.2), usefulLifeMonths: 6 + Math.floor(r() * 60), method: pick(['straight_line', 'declining_balance'] as const),
      funding: pick(['wallet', 'opening'] as const), paidFromAccountId: 'w-bank', ref: 'AST/' + i, createdAt: 100 + i,
    };
    if (r() < 0.25) a.depreciable = false;
    if (r() < 0.5) a.disposal = { date: addDays(a.acquisitionDate, 30 + Math.floor(r() * 500)), proceeds: Math.round(r() * cost), accountId: 'w-bank' };
    d.assets.push(a);
  }
  return d;
}

describe('uji acak keseimbangan buku', () => {
  it('300 buku acak: semua kontrol laporan lolos', () => {
    const problems: string[] = [];
    for (let seed = 1; seed <= 300; seed++) {
      const d = build(seed);
      const b = getBooks(d);
      for (const e of buildJournal(d)) if (!entryTotals(e).balanced) problems.push(`seed ${seed}: jurnal ${e.ref} tidak seimbang`);
      for (const to of ['2025-03-31', '2025-06-30', '2025-12-31', '2026-02-28', '2026-06-30', '2026-09-30']) {
        const bs = balanceSheet(b, [{ to, label: to }], 'x');
        for (const c of bs.checks ?? []) if (!c.ok) problems.push(`seed ${seed}: neraca ${to} selisih ${c.diff}`);
        for (const c of trialBalance(b, to, 'x').checks ?? []) if (!c.ok) problems.push(`seed ${seed}: neraca saldo ${to} selisih ${c.diff}`);
        const eq = bs.rows.find((x) => x.key === 't-eq')!.values[0]!;
        if (Math.abs(positionAt(b, to).equity - eq) > 0.01) problems.push(`seed ${seed}: ekuitas posisi ≠ neraca ${to}`);
      }
      for (const [from, to] of [['2025-01-01', '2025-12-31'], ['2025-04-01', '2026-03-31'], ['2026-01-01', '2026-09-30'], ['2025-07-15', '2026-02-10'], ['2026-09-01', '2026-09-30']]) {
        const p = { from, to, label: from };
        for (const rep of [cashFlowStatement(b, [p], 'x'), incomeStatement(b, [p], 'x'), equityStatement(b, p, 'x'), worksheet(b, p, 'x')])
          for (const c of rep.checks ?? []) if (!c.ok) problems.push(`seed ${seed}: ${rep.id} [${from}..${to}] ${c.label} selisih ${c.diff}`);
      }
    }
    expect(problems.slice(0, 10)).toEqual([]);
  });
});
