import { beforeEach, describe, expect, it } from 'vitest';
import {
  accountUsage,
  addAccount,
  addTransaction,
  budgetKind,
  budgetTargetKey,
  deleteAccount,
  deleteTransactions,
  emptyData,
  normalizeData,
  upsertBudget,
  useData,
} from '../../store/data';
import type { Budget } from '../types';

describe('model anggaran & store (pengeluaran dan pembayaran hutang)', () => {
  beforeEach(() => {
    useData.setState({ data: emptyData(), past: [], future: [], lastId: null });
  });

  it('normalizeData mempertahankan anggaran lama, menormalkan anggaran hutang, dan membuang duplikat per target', () => {
    const d = emptyData();
    d.budgets = [
      { id: 'b1', categoryId: 'acc-food', amount: 1_000_000, createdAt: 1 },
      { id: 'b2', categoryId: 'acc-food', amount: 1_500_000, createdAt: 2 },
      { id: 'b3', kind: 'debt', amount: 2_000_000, createdAt: 3 },
      { id: 'b4', kind: 'debt', amount: 2_500_000, createdAt: 4 },
      { id: 'b5', kind: 'debt', debtId: 'tx-loan-1', amount: 800_000, createdAt: 5 },
      { id: 'b6', kind: 'debt', debtId: 'tx-loan-1', amount: 900_000, createdAt: 6 },
      { id: 'b7', kind: 'expense', categoryId: '', amount: 500_000, createdAt: 7 },
      { id: 'b8', kind: 'debt', amount: 0, createdAt: 8 },
    ] as Budget[];

    const norm = normalizeData(d);
    expect(norm.budgets).toHaveLength(3);
    expect(norm.budgets.map((b) => [budgetKind(b), budgetTargetKey(b), b.amount])).toEqual([
      ['expense', 'expense:acc-food', 1_500_000],
      ['debt', 'debt:all', 2_500_000],
      ['debt', 'debt:tx-loan-1', 900_000],
    ]);
    // Anggaran hutang tidak menyisakan categoryId kosong dan agregat tidak menyisakan debtId kosong
    const agg = norm.budgets.find((b) => budgetTargetKey(b) === 'debt:all')!;
    expect(agg.categoryId).toBeUndefined();
    expect(agg.debtId).toBeUndefined();
  });

  it('upsertBudget mendukung overload string lama serta BudgetTarget pengeluaran, hutang agregat, dan per hutang', () => {
    upsertBudget('acc-food', 1_200_000);
    upsertBudget({ kind: 'expense', categoryId: 'acc-food' }, 1_400_000);
    upsertBudget({ kind: 'debt' }, 3_000_000);
    upsertBudget({ kind: 'debt', debtId: 'tx-h1' }, 1_000_000);
    upsertBudget({ kind: 'debt', debtId: 'tx-h1' }, 1_250_000);

    const budgets = useData.getState().data.budgets;
    expect(budgets).toHaveLength(3);
    expect(budgets.find((b) => budgetTargetKey(b) === 'expense:acc-food')?.amount).toBe(1_400_000);
    expect(budgets.find((b) => budgetTargetKey(b) === 'debt:all')?.amount).toBe(3_000_000);
    expect(budgets.find((b) => budgetTargetKey(b) === 'debt:tx-h1')?.amount).toBe(1_250_000);
  });

  it('deleteTransactions menghapus anggaran hutang terkait secara atomik dan undo memulihkan keduanya', () => {
    const { tx: debt } = addTransaction({
      type: 'payable_new',
      date: '2026-03-01',
      amount: 5_000_000,
      accountId: 'acc-bank',
      contact: 'Koperasi',
      description: 'Pinjaman modal',
    });
    upsertBudget({ kind: 'debt', debtId: debt.id }, 1_000_000);
    upsertBudget({ kind: 'debt' }, 2_000_000);

    expect(useData.getState().data.budgets).toHaveLength(2);
    deleteTransactions([debt.id]);

    // Anggaran spesifik ikut terhapus; anggaran agregat tetap utuh
    expect(useData.getState().data.transactions.find((t) => t.id === debt.id)).toBeUndefined();
    expect(useData.getState().data.budgets.map((b) => budgetTargetKey(b))).toEqual(['debt:all']);

    // Undo memulihkan transaksi hutang sekaligus anggaran spesifiknya
    useData.getState().undo();
    expect(useData.getState().data.transactions.find((t) => t.id === debt.id)).toBeDefined();
    expect(useData.getState().data.budgets.map((b) => budgetTargetKey(b))).toEqual([`debt:${debt.id}`, 'debt:all']);
  });

  it('accountUsage dan deleteAccount tidak terpengaruh oleh anggaran pembayaran hutang', () => {
    const { account: customExp } = addAccount({
      name: 'Beban Uji',
      type: 'expense',
      subtype: 'operating_expense',
      icon: 'tag',
      color: '#5160B8',
    });
    upsertBudget({ kind: 'debt' }, 1_500_000);

    expect(accountUsage(customExp.id)).toBe(0);
    expect(deleteAccount(customExp.id)).not.toBe('');
    expect(useData.getState().data.budgets.map((b) => budgetTargetKey(b))).toEqual(['debt:all']);
  });
});
