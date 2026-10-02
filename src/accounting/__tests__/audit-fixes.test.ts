import { beforeEach, describe, expect, it } from 'vitest';
import { addTransaction, deleteTransactions, emptyData, updateTransaction, useData } from '../../store/data';
import { buildJournal, depreciationSchedule, entryTotals } from '../engine';
import { lockViolations } from '../lock';
import { balanceSheet, cashFlowStatement, getBooks, monthlySeries, periodFlow } from '../reports';
import { addMonths, endOfMonth, startOfMonth, todayISO } from '../../lib/format';
import type { Account, AppData, FixedAsset, Transaction } from '../types';

let n = 0;
const tx = (t: Partial<Transaction> & Pick<Transaction, 'type' | 'date'>): Transaction => {
  n++;
  return { id: 'f' + n, amount: 0, description: '', ref: `F/${n}`, createdAt: n, updatedAt: n, ...t } as Transaction;
};
const acc = (id: string, code: string, subtype: Account['subtype'], type: Account['type']): Account => ({ id, code, name: id, subtype, type, icon: 'tag', color: '#000', createdAt: 1 });
const asset = (p: Partial<FixedAsset> = {}): FixedAsset => ({
  id: 'fa', name: 'Aset', accountId: 'acc-equipment', acquisitionDate: '2025-01-10', cost: 12_000_000, residualValue: 0, usefulLifeMonths: 12,
  method: 'straight_line', funding: 'opening', ref: 'AST/2025/01/0001', createdAt: 5, ...p,
});
const base = (): AppData => {
  const d = emptyData();
  d.accounts.push(acc('bank', '1-1200', 'bank', 'asset'), acc('cc', '2-1200', 'credit_card', 'liability'));
  return d;
};

describe('bulan berjalan dihitung sampai hari ini', () => {
  it('jurnal penyusutan akhir bulan yang belum tiba tidak ikut di titik bulan berjalan', () => {
    const today = todayISO();
    const d = base();
    const start = addMonths(startOfMonth(today), -3);
    d.transactions.push(tx({ type: 'opening', date: start, amount: 50_000_000, accountId: 'acc-cash' }));
    d.assets.push(asset({ acquisitionDate: start }));
    const b = getBooks(d);
    const cur = monthlySeries(b, today.slice(0, 7), 2, today)[1];
    const mtd = periodFlow(b, startOfMonth(today), today);
    expect(cur.expense).toBe(mtd.expense);
    if (endOfMonth(today) > today) {
      expect(cur.partial).toBe(true);
      // penyusutan bertanggal akhir bulan memang ada di buku, tetapi belum jatuh tempo
      expect(periodFlow(b, startOfMonth(today), endOfMonth(today)).expense).toBeGreaterThan(mtd.expense);
    }
  });
});

describe('arus kas: saldo awal dibukukan di tengah periode', () => {
  it('kas awal sama dengan neraca; saldo awal rekening baru jadi baris sendiri; semua kontrol lolos', () => {
    const d = base();
    d.transactions.push(
      tx({ type: 'opening', date: '2026-01-01', amount: 1_000_000, accountId: 'acc-cash' }),
      tx({ type: 'opening', date: '2026-03-15', amount: 5_000_000, accountId: 'bank' }),
      tx({ type: 'income', date: '2026-02-01', amount: 2_000_000, accountId: 'acc-cash', categoryId: 'acc-salary' }),
    );
    const b = getBooks(d);
    const cf = cashFlowStatement(b, [{ from: '2026-01-01', to: '2026-03-31', label: 'Q1' }], 'x');
    const v = (key: string) => cf.rows.find((r) => r.key === key)?.values[0];
    expect(v('t-begin')).toBe(1_000_000);
    expect(v('t-open')).toBe(5_000_000);
    expect(v('t-end')).toBe(8_000_000);
    for (const c of cf.checks ?? []) expect(c.ok, c.label).toBe(true);
  });
});

describe('aset yang tidak disusutkan', () => {
  it('tanah dibukukan sebesar harga perolehan tanpa jurnal penyusutan', () => {
    const d = base();
    d.transactions.push(tx({ type: 'opening', date: '2025-01-01', amount: 500_000_000, accountId: 'acc-cash' }));
    d.assets.push(asset({ id: 'land', name: 'Tanah', accountId: 'acc-building', cost: 300_000_000, depreciable: false }));
    expect(depreciationSchedule(d.assets[0])).toEqual([]);
    expect(buildJournal(d).some((e) => e.source === 'depreciation')).toBe(false);
    const bs = balanceSheet(getBooks(d), [{ to: '2026-09-30', label: 'x' }], 'x');
    expect(bs.checks?.every((c) => c.ok)).toBe(true);
    expect(bs.rows.find((r) => r.key === 't-assets')?.values[0]).toBe(500_000_000 + 300_000_000);
  });
});

describe('tarik tunai kartu kredit', () => {
  it('masuk aktivitas pendanaan, bukan operasi; pembayaran tagihan tetap operasi', () => {
    const d = base();
    d.transactions.push(
      tx({ type: 'opening', date: '2026-01-01', amount: 1_000_000, accountId: 'bank' }),
      tx({ type: 'transfer', date: '2026-02-01', amount: 2_000_000, accountId: 'cc', toAccountId: 'bank' }),
      tx({ type: 'transfer', date: '2026-03-01', amount: 500_000, accountId: 'bank', toAccountId: 'cc' }),
    );
    const cf = cashFlowStatement(getBooks(d), [{ from: '2026-01-01', to: '2026-03-31', label: 'Q1' }], 'x');
    const v = (key: string) => cf.rows.find((r) => r.key === key)?.values[0];
    expect(v('st-fin')).toBe(2_000_000);
    expect(v('st-op')).toBe(-500_000);
    for (const c of cf.checks ?? []) expect(c.ok, c.label).toBe(true);
    for (const e of buildJournal(d)) expect(entryTotals(e).balanced).toBe(true);
  });
});

describe('nomor bukti permanen', () => {
  beforeEach(() => useData.setState({ data: emptyData(), past: [], future: [], lastId: null }));
  const inc = (date: string) => addTransaction({ type: 'income', date, amount: 1000, accountId: 'acc-cash', categoryId: 'acc-salary', description: '' }).tx;

  it('tidak dipakai ulang setelah transaksi terakhir dihapus', () => {
    const a = inc('2026-05-01');
    const b = inc('2026-05-02');
    expect([a.ref, b.ref]).toEqual(['BKM/2026/05/0001', 'BKM/2026/05/0002']);
    deleteTransactions([b.id]);
    expect(inc('2026-05-03').ref).toBe('BKM/2026/05/0003');
  });

  it('tidak berganti saat tanggal dipindah ke bulan lain', () => {
    const a = inc('2026-05-01');
    updateTransaction(a.id, { date: '2026-07-20' });
    expect(useData.getState().data.transactions.find((t) => t.id === a.id)?.ref).toBe('BKM/2026/05/0001');
  });

  it('nomor baru hanya bila jenis dokumen berubah', () => {
    const a = inc('2026-05-01');
    updateTransaction(a.id, { type: 'expense', categoryId: 'acc-food' });
    expect(useData.getState().data.transactions.find((t) => t.id === a.id)?.ref).toBe('BKK/2026/05/0001');
  });
});

describe('kunci periode melindungi pengelompokan akun', () => {
  const locked = (): AppData => {
    const d = base();
    d.profile.lockDate = '2025-12-31';
    d.transactions.push(tx({ type: 'expense', date: '2025-06-01', amount: 1000, accountId: 'bank', categoryId: 'acc-food' }));
    return d;
  };

  it('menolak ubah jenis akun yang dipakai di periode terkunci', () => {
    const d = locked();
    const next = { ...d, accounts: d.accounts.map((a) => (a.id === 'acc-food' ? { ...a, subtype: 'other_expense' as const } : a)) };
    expect(lockViolations(d, next).some((v) => v.kind === 'account')).toBe(true);
    const bank = { ...d, accounts: d.accounts.map((a) => (a.id === 'bank' ? { ...a, subtype: 'investment' as const } : a)) };
    expect(lockViolations(d, bank).some((v) => v.kind === 'account')).toBe(true);
  });

  it('mengizinkan ubah jenis akun yang tidak dipakai di periode terkunci, dan ubah nama/ikon', () => {
    const d = locked();
    const unused = { ...d, accounts: d.accounts.map((a) => (a.id === 'acc-transport' ? { ...a, subtype: 'other_expense' as const } : a)) };
    expect(lockViolations(d, unused)).toEqual([]);
    const rename = { ...d, accounts: d.accounts.map((a) => (a.id === 'acc-food' ? { ...a, name: 'Makan' } : a)) };
    expect(lockViolations(d, rename)).toEqual([]);
  });

  it('menolak ubah awal tahun buku saat ada kunci, tetapi bebas tanpa kunci', () => {
    const d = locked();
    expect(lockViolations(d, { ...d, profile: { ...d.profile, fiscalYearStartMonth: 7 } }).some((v) => v.kind === 'profile')).toBe(true);
    const free = { ...d, profile: { ...d.profile, lockDate: undefined } };
    expect(lockViolations(free, { ...free, profile: { ...free.profile, fiscalYearStartMonth: 7 } })).toEqual([]);
  });
});

describe('pengembalian dana (refund)', () => {
  it('pemasukan ke kategori beban mengurangi beban, bukan menambah pendapatan', () => {
    const d = base();
    d.transactions.push(
      tx({ type: 'opening', date: '2026-01-01', amount: 1_000_000, accountId: 'bank' }),
      tx({ type: 'expense', date: '2026-02-01', amount: 300_000, accountId: 'bank', categoryId: 'acc-shopping' }),
      tx({ type: 'income', date: '2026-02-10', amount: 100_000, accountId: 'bank', categoryId: 'acc-shopping' }),
    );
    const f = periodFlow(getBooks(d), '2026-02-01', '2026-02-28');
    expect(f).toEqual({ income: 0, expense: 200_000, net: -200_000 });
    for (const e of buildJournal(d)) expect(entryTotals(e).balanced).toBe(true);
  });
});
