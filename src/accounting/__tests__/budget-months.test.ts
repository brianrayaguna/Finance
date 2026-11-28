import { beforeEach, describe, expect, it } from 'vitest';
import { addTransaction, deleteBudget, emptyData, normalizeData, upsertBudget, useData } from '../../store/data';
import { budgetVsActual, resolveBudgetAmount } from '../budgets';
import { getBooks } from '../reports';
import type { Budget } from '../types';

const FOOD = { kind: 'expense', categoryId: 'acc-food' } as const;
const FOOD_KEY = 'expense:acc-food';

const lastDay = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')}`;
};

/** Baris anggaran untuk satu bulan penuh (atau undefined bila tidak dianggarkan). */
const lineFor = (month: string, key = FOOD_KEY) =>
  budgetVsActual(getBooks(useData.getState().data), `${month}-01`, lastDay(month)).find((l) => l.key === key);

const budgetFor = (month: string, key = FOOD_KEY) => lineFor(month, key)?.budget;

const setBudgets = (budgets: Budget[]) =>
  useData.setState((s) => ({ ...s, data: { ...s.data, budgets } }));

describe('anggaran per bulan: aturan nominal', () => {
  beforeEach(() => {
    useData.setState({ data: emptyData(), past: [], future: [], lastId: null });
  });

  it('versi rutin berlaku mulai bulannya, bulan sebelumnya tetap memakai anggaran lama', () => {
    setBudgets([
      { id: 'a', categoryId: 'acc-food', amount: 500_000, createdAt: 1 },
      { id: 'b', categoryId: 'acc-food', from: '2026-12', amount: 900_000, createdAt: 2 },
    ]);
    expect(budgetFor('2026-11')).toBe(500_000);
    expect(budgetFor('2026-12')).toBe(900_000);
    expect(budgetFor('2027-01')).toBe(900_000);
  });

  it('anggaran khusus satu bulan mengalahkan versi rutin hanya pada bulan itu', () => {
    setBudgets([
      { id: 'a', categoryId: 'acc-food', amount: 500_000, createdAt: 1 },
      { id: 'b', categoryId: 'acc-food', month: '2026-12', amount: 2_000_000, createdAt: 2 },
    ]);
    expect(budgetFor('2026-11')).toBe(500_000);
    expect(budgetFor('2026-12')).toBe(2_000_000);
    expect(budgetFor('2027-01')).toBe(500_000);
  });

  it('nominal 0 menyembunyikan baris: khusus hanya di bulannya, versi rutin mulai bulannya', () => {
    setBudgets([
      { id: 'a', categoryId: 'acc-food', amount: 500_000, createdAt: 1 },
      { id: 'b', categoryId: 'acc-food', month: '2026-12', amount: 0, createdAt: 2 },
      { id: 'c', categoryId: 'acc-food', from: '2027-03', amount: 0, createdAt: 3 },
    ]);
    expect(lineFor('2026-12')).toBeUndefined();
    expect(budgetFor('2027-01')).toBe(500_000);
    expect(lineFor('2027-03')).toBeUndefined();
    expect(lineFor('2027-06')).toBeUndefined();
  });

  it('tanpa versi yang berlaku, bulan sebelum versi pertama tidak dianggarkan', () => {
    setBudgets([{ id: 'a', categoryId: 'acc-food', from: '2026-12', amount: 700_000, createdAt: 1 }]);
    expect(lineFor('2026-11')).toBeUndefined();
    expect(budgetFor('2026-12')).toBe(700_000);
  });

  it('rentang beberapa bulan menjumlahkan nominal tiap bulan', () => {
    setBudgets([
      { id: 'a', categoryId: 'acc-food', amount: 500_000, createdAt: 1 },
      { id: 'b', categoryId: 'acc-food', month: '2026-12', amount: 2_000_000, createdAt: 2 },
    ]);
    const q4 = budgetVsActual(getBooks(useData.getState().data), '2026-10-01', '2026-12-31').find((l) => l.key === FOOD_KEY);
    expect(q4?.budget).toBe(3_000_000); // 500rb + 500rb + 2jt
  });

  it('rentang sebagian bulan memakai porsi hari bulan itu', () => {
    setBudgets([{ id: 'b', categoryId: 'acc-food', month: '2026-12', amount: 3_100_000, createdAt: 2 }]);
    const half = budgetVsActual(getBooks(useData.getState().data), '2026-12-01', '2026-12-15').find((l) => l.key === FOOD_KEY);
    expect(half?.budget).toBe(1_500_000); // 3,1jt × 15/31
  });

  it('anggaran pembayaran hutang agregat juga mengikuti versi per bulan', () => {
    setBudgets([
      { id: 'a', kind: 'debt', amount: 1_000_000, createdAt: 1 },
      { id: 'b', kind: 'debt', from: '2026-03', amount: 1_500_000, createdAt: 2 },
    ]);
    const range = budgetVsActual(getBooks(useData.getState().data), '2026-02-01', '2026-03-31').find((l) => l.key === 'debt:all');
    expect(range?.budget).toBe(2_500_000);
  });

  it('anggaran per hutang mengikuti versi per bulan dalam rentang aktif hutang', () => {
    const { tx: d } = addTransaction({ type: 'payable_new', date: '2026-02-10', amount: 6_000_000, accountId: 'acc-cash', contact: 'Bank A', description: 'Pinjaman' });
    setBudgets([
      { id: 'a', kind: 'debt', debtId: d.id, amount: 1_000_000, createdAt: 1 },
      { id: 'b', kind: 'debt', debtId: d.id, month: '2026-03', amount: 2_000_000, createdAt: 2 },
    ]);
    // Januari sebelum hutang tercatat tidak dihitung: Februari 1jt + Maret 2jt
    const range = budgetVsActual(getBooks(useData.getState().data), '2026-01-01', '2026-03-31').find((l) => l.key === `debt:${d.id}`);
    expect(range?.budget).toBe(3_000_000);
  });

  it('baris satu bulan menandai sumber anggaran: khusus atau rutin', () => {
    setBudgets([
      { id: 'a', categoryId: 'acc-food', amount: 500_000, createdAt: 1 },
      { id: 'b', categoryId: 'acc-food', month: '2026-12', amount: 2_000_000, createdAt: 2 },
    ]);
    expect(lineFor('2026-12')?.source).toBe('month');
    expect(lineFor('2027-01')?.source).toBe('recurring');
  });

  it('resolveBudgetAmount mengembalikan nominal yang berlaku untuk satu bulan', () => {
    const budgets: Budget[] = [
      { id: 'a', categoryId: 'acc-food', amount: 500_000, createdAt: 1 },
      { id: 'b', categoryId: 'acc-food', from: '2027-02', amount: 650_000, createdAt: 2 },
      { id: 'c', categoryId: 'acc-food', month: '2026-12', amount: 2_000_000, createdAt: 3 },
    ];
    expect(resolveBudgetAmount(budgets, FOOD_KEY, '2026-11')).toEqual({ amount: 500_000, source: 'recurring' });
    expect(resolveBudgetAmount(budgets, FOOD_KEY, '2026-12')).toEqual({ amount: 2_000_000, source: 'month' });
    expect(resolveBudgetAmount(budgets, FOOD_KEY, '2027-02')).toEqual({ amount: 650_000, source: 'recurring' });
    expect(resolveBudgetAmount(budgets, 'expense:acc-transport', '2026-12')).toBeNull();
  });
});

describe('anggaran per bulan: operasi store', () => {
  beforeEach(() => {
    useData.setState({ data: emptyData(), past: [], future: [], lastId: null });
  });

  it('cakupan "hanya" menyimpan anggaran khusus dan menggantinya bila disimpan ulang', () => {
    upsertBudget(FOOD, 500_000);
    upsertBudget(FOOD, 1_800_000, { month: '2026-12', scope: 'only' });
    upsertBudget(FOOD, 2_100_000, { month: '2026-12', scope: 'only' });
    expect(useData.getState().data.budgets).toHaveLength(2);
    expect(budgetFor('2026-11')).toBe(500_000);
    expect(budgetFor('2026-12')).toBe(2_100_000);
    expect(budgetFor('2027-01')).toBe(500_000);
  });

  it('cakupan "seterusnya" tidak mengubah bulan lalu dan menggantikan versi yang lebih baru', () => {
    upsertBudget(FOOD, 500_000);
    upsertBudget(FOOD, 600_000, { month: '2027-01', scope: 'onward' });
    upsertBudget(FOOD, 1_000_000, { month: '2027-02', scope: 'only' });
    upsertBudget(FOOD, 700_000, { month: '2026-12', scope: 'onward' });
    expect(budgetFor('2026-11')).toBe(500_000);
    expect(budgetFor('2026-12')).toBe(700_000);
    expect(budgetFor('2027-01')).toBe(700_000); // versi Januari terganti
    expect(budgetFor('2027-02')).toBe(1_000_000); // anggaran khusus dipertahankan
  });

  it('tanpa opsi cakupan, simpan menyatukan semua catatan target menjadi satu anggaran rutin', () => {
    upsertBudget(FOOD, 600_000, { month: '2027-01', scope: 'onward' });
    upsertBudget(FOOD, 1_000_000, { month: '2026-12', scope: 'only' });
    upsertBudget(FOOD, 450_000);
    expect(useData.getState().data.budgets).toHaveLength(1);
    expect(budgetFor('2026-01')).toBe(450_000);
    expect(budgetFor('2026-12')).toBe(450_000);
  });

  it('hapus "hanya" menyembunyikan anggaran pada bulan itu saja', () => {
    upsertBudget(FOOD, 500_000);
    deleteBudget(FOOD, { month: '2026-12', scope: 'only' });
    expect(budgetFor('2026-11')).toBe(500_000);
    expect(lineFor('2026-12')).toBeUndefined();
    expect(budgetFor('2027-01')).toBe(500_000);
  });

  it('hapus "seterusnya" menghentikan anggaran mulai bulan itu dan membuang catatan sesudahnya', () => {
    upsertBudget(FOOD, 500_000);
    upsertBudget(FOOD, 1_000_000, { month: '2027-02', scope: 'only' });
    deleteBudget(FOOD, { month: '2026-12', scope: 'onward' });
    expect(budgetFor('2026-11')).toBe(500_000);
    expect(lineFor('2026-12')).toBeUndefined();
    expect(lineFor('2027-02')).toBeUndefined();
    expect(useData.getState().data.budgets.some((b) => b.month === '2027-02')).toBe(false);
  });

  it('hapus tanpa opsi cakupan membuang seluruh catatan target', () => {
    upsertBudget(FOOD, 500_000);
    upsertBudget(FOOD, 1_000_000, { month: '2026-12', scope: 'only' });
    upsertBudget({ kind: 'expense', categoryId: 'acc-transport' }, 300_000);
    deleteBudget(FOOD);
    const left = useData.getState().data.budgets;
    expect(left).toHaveLength(1);
    expect(left[0].categoryId).toBe('acc-transport');
  });
});

describe('anggaran per bulan: normalisasi data', () => {
  it('mempertahankan versi & anggaran khusus per target, membuang duplikat per bulan dan format bulan tidak sah', () => {
    const d = emptyData();
    d.budgets = [
      { id: 'a', categoryId: 'acc-food', amount: 500_000, createdAt: 1 },
      { id: 'b', categoryId: 'acc-food', from: '2026-12', amount: 800_000, createdAt: 2 },
      { id: 'c', categoryId: 'acc-food', from: '2026-12', amount: 850_000, createdAt: 3 },
      { id: 'd', categoryId: 'acc-food', month: '2027-02', amount: 0, createdAt: 4 },
      { id: 'e', categoryId: 'acc-food', month: '2027-2', amount: 100_000, createdAt: 5 },
      { id: 'f', categoryId: 'acc-food', from: '2027-05', month: '2027-05', amount: 200_000, createdAt: 6 },
      { id: 'g', categoryId: 'acc-transport', amount: 0, createdAt: 7 },
    ] as Budget[];
    const norm = normalizeData(d);
    expect(norm.budgets.map((b) => [b.categoryId, b.from, b.month, b.amount])).toEqual([
      ['acc-food', undefined, undefined, 500_000],
      ['acc-food', '2026-12', undefined, 850_000],
      ['acc-food', undefined, '2027-02', 0],
      ['acc-food', undefined, '2027-05', 200_000],
    ]);
  });
});
