import { beforeEach, describe, expect, it } from 'vitest';
import { previousPeriod } from '../periods';
import { goalProgress } from '../goals';
import { getBooks } from '../reports';
import { txFlow } from '../../components/tx/txDisplay';
import { sanitizeLayout } from '../../app/dashboardLayout';
import { addTransaction, emptyData, SYS, useData } from '../../store/data';
import type { Goal, Transaction } from '../types';

describe('perbaikan akuntansi, tata letak dasbor, dan aliran transaksi', () => {
  beforeEach(() => {
    useData.setState({ data: emptyData(), past: [], future: [], lastId: null });
  });

  it('previousPeriod membandingkan kuartal 1 (Jan–Mar) dengan kuartal 4 tahun sebelumnya', () => {
    expect(previousPeriod('2026-01-01', '2026-03-31')).toEqual({
      from: '2025-10-01',
      to: '2025-12-31',
    });
    // YTD panjang (> 95 hari) tetap dibandingkan dengan periode sama tahun lalu
    expect(previousPeriod('2026-01-01', '2026-06-30')).toEqual({
      from: '2025-01-01',
      to: '2025-06-30',
    });
  });

  it('goalProgress membuang duplikat akun, menandai unlinked bila semua akun hilang, dan tidak menandai done bila target <= 0', () => {
    addTransaction({ type: 'opening', date: '2026-01-01', amount: 1_000_000, accountId: SYS.cash, description: '' });
    const b = getBooks(useData.getState().data);

    const dupGoal: Goal = {
      id: 'g1',
      name: 'Dana darurat',
      target: 5_000_000,
      accountIds: [SYS.cash, SYS.cash],
      icon: 'piggy-bank',
      color: '#1F8A57',
      createdAt: 1,
    };
    const pDup = goalProgress(b, dupGoal, '2026-03-01');
    expect(pDup.current).toBe(1_000_000);

    const missingGoal: Goal = { ...dupGoal, id: 'g2', accountIds: ['acc-tidak-ada'] };
    expect(goalProgress(b, missingGoal, '2026-03-01').status).toBe('unlinked');

    const zeroTarget: Goal = { ...dupGoal, id: 'g3', target: 0 };
    expect(goalProgress(b, zeroTarget, '2026-03-01').status).not.toBe('done');
  });

  it('txFlow menghitung pengembalian dana (refund) dan pembelian/penjualan kredit secara tepat', () => {
    const b = getBooks(emptyData());
    const base = { id: 't1', date: '2026-03-01', amount: 100_000, description: '', ref: 'R/1', createdAt: 1, updatedAt: 1 };

    // Pengembalian dana pengeluaran: income ke kategori beban → mengurangi exp
    const refundExp: Transaction = { ...base, type: 'income', accountId: SYS.cash, categoryId: 'acc-food' };
    expect(txFlow(refundExp, b.acc)).toEqual({ inc: 0, exp: -100_000 });

    // Pengembalian pendapatan: expense ke kategori pendapatan → mengurangi inc
    const refundRev: Transaction = { ...base, type: 'expense', accountId: SYS.cash, categoryId: 'acc-salary' };
    expect(txFlow(refundRev, b.acc)).toEqual({ inc: -100_000, exp: 0 });

    // Pembelian kredit: payable_new dengan counter === 'category' → menambah exp
    const creditBuy: Transaction = { ...base, type: 'payable_new', counter: 'category', categoryId: 'acc-shopping' };
    expect(txFlow(creditBuy, b.acc)).toEqual({ inc: 0, exp: 100_000 });

    // Penjualan kredit: receivable_new dengan counter === 'category' → menambah inc
    const creditSell: Transaction = { ...base, type: 'receivable_new', counter: 'category', categoryId: 'acc-salary' };
    expect(txFlow(creditSell, b.acc)).toEqual({ inc: 100_000, exp: 0 });
  });

  it('sanitizeLayout membuang duplikat KPI dan memeriksa panjang KPI pada deteksi bawaan lama', () => {
    const clean = sanitizeLayout({
      order: ['hero', 'kpi'],
      sizes: {},
      settings: {},
      kpi: ['income', 'income', 'cash', 'cash'],
    });
    expect(new Set(clean.kpi).size).toBe(4);
    expect(clean.kpi).toHaveLength(4);

    // Tata letak lama dengan kpi lebih pendek (2 item) adalah kustomisasi, bukan bawaan lama penuh
    const customLegacyOrder = sanitizeLayout({
      order: ['hero', 'kpi', 'cashflow', 'composition', 'recent', 'wallets', 'budgets', 'debts', 'health'],
      sizes: {},
      settings: {},
      kpi: ['income', 'expense'],
    });
    expect(customLegacyOrder.order).toContain('wallets');
  });
});
