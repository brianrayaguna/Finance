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

import {
  budgetBreakdown,
  budgetStatus,
  budgetSummary,
  budgetThreeMonthAverage,
  budgetVsActual,
  matchesDebtPaymentBudget,
} from '../budgets';
import { budgetReport, getBooks } from '../reports';
import { checkIntegrity } from '../integrity';
import { addAsset, SYS } from '../../store/data';

describe('mesin anggaran pembayaran hutang & rincian (budgets.ts)', () => {
  beforeEach(() => {
    useData.setState({ data: emptyData(), past: [], future: [], lastId: null });
  });

  it('menghitung realisasi anggaran pembayaran hutang agregat & per-hutang termasuk pokok+bunga dari semua jenis dompet, mengecualikan kartu kredit dan beban bunga berdiri sendiri', () => {
    const { account: bank } = addAccount({ name: 'Rekening Bank', type: 'asset', subtype: 'bank', icon: 'landmark', color: '#0B4C72' });
    const { account: invest } = addAccount({ name: 'Rekening Investasi', type: 'asset', subtype: 'investment', icon: 'trending-up', color: '#1F8A57' });
    const { account: loan } = addAccount({ name: 'Pinjaman Bank', type: 'liability', subtype: 'loan', icon: 'handshake', color: '#C46A1F' });
    const { account: cc } = addAccount({ name: 'Kartu Kredit', type: 'liability', subtype: 'credit_card', icon: 'credit-card', color: '#5160B8' });

    // Hutang tunai 1: KPR/Pinjaman Bank
    const { tx: d1 } = addTransaction({
      type: 'payable_new',
      date: '2026-01-05',
      amount: 10_000_000,
      accountId: bank.id,
      contact: 'Bank Nusantara',
      description: 'Pinjaman Renovasi',
    });
    // Hutang pembelian kredit 2 (counter === 'category')
    const { tx: d2 } = addTransaction({
      type: 'payable_new',
      date: '2026-02-01',
      amount: 3_000_000,
      categoryId: 'acc-shopping',
      counter: 'category',
      contact: 'Toko Elektronik',
      description: 'Cicilan Laptop',
    });
    // Bayar d1 dari bank: pokok 1jt + bunga 150rb = 1.150.000
    addTransaction({
      type: 'payable_pay',
      date: '2026-03-05',
      amount: 1_000_000,
      interest: 150_000,
      accountId: bank.id,
      parentId: d1.id,
      description: 'Cicilan 1',
    });
    // Bayar d2 dari dompet investasi (non-cashIds): pokok 500rb + bunga 25rb = 525.000
    addTransaction({
      type: 'payable_pay',
      date: '2026-03-10',
      amount: 500_000,
      interest: 25_000,
      accountId: invest.id,
      parentId: d2.id,
      description: 'Cicilan laptop',
    });
    // Transfer langsung ke akun pinjaman (loan) 400rb — ikut di agregat
    addTransaction({
      type: 'transfer',
      date: '2026-03-12',
      amount: 400_000,
      accountId: bank.id,
      toAccountId: loan.id,
      description: 'Angsuran langsung pinjaman',
    });
    // Bayar tagihan kartu kredit 800rb — HARUS dikecualikan dari anggaran hutang
    addTransaction({
      type: 'transfer',
      date: '2026-03-15',
      amount: 800_000,
      accountId: bank.id,
      toAccountId: cc.id,
      description: 'Bayar tagihan kartu kredit',
    });
    // Beban bunga berdiri sendiri (expense ke acc-interest-expense) — HARUS dikecualikan dari anggaran hutang
    addTransaction({
      type: 'expense',
      date: '2026-03-18',
      amount: 75_000,
      accountId: bank.id,
      categoryId: SYS.interestExpense,
      description: 'Biaya bunga kartu',
    });

    upsertBudget({ kind: 'debt' }, 2_000_000);
    upsertBudget({ kind: 'debt', debtId: d1.id }, 1_200_000);
    upsertBudget({ kind: 'debt', debtId: d2.id }, 600_000);

    const b = getBooks(useData.getState().data);
    const lines = budgetVsActual(b, '2026-03-01', '2026-03-31');

    const agg = lines.find((l) => l.key === 'debt:all')!;
    const l1 = lines.find((l) => l.key === `debt:${d1.id}`)!;
    const l2 = lines.find((l) => l.key === `debt:${d2.id}`)!;

    // Agregat = 1.150.000 + 525.000 + 400.000 = 2.075.000 (melebihi 2.000.000)
    expect(agg.kind).toBe('debt');
    expect(agg.actual).toBe(2_075_000);
    expect(agg.variance).toBe(-75_000);
    expect(budgetStatus(agg.used, 0.5)).toBe('over');

    // Per-hutang 1 = 1.150.000
    expect(l1.actual).toBe(1_150_000);
    expect(l1.kind === 'debt' && l1.isCreditPurchase).toBe(false);

    // Per-hutang 2 (pembelian kredit, dibayar dari investasi) = 525.000
    expect(l2.actual).toBe(525_000);
    expect(l2.kind === 'debt' && l2.isCreditPurchase).toBe(true);

    // Ringkasan anti hitung ganda: memakai agregat (2jt / 2,075jt), bukan 2jt + 1,2jt + 600rb
    const sum = budgetSummary(lines);
    expect(sum.debtBudget).toBe(2_000_000);
    expect(sum.debtActual).toBe(2_075_000);
    expect(sum.totalBudget).toBe(2_000_000);
    expect(sum.totalActual).toBe(2_075_000);
    expect(sum.overCount).toBe(1);
    expect(sum.specificExceedsAggregate).toBe(false);

    // Breakdown jumlahnya 100% cocok dengan actual
    for (const line of [agg, l1, l2]) {
      const items = budgetBreakdown(b, line, '2026-03-01', '2026-03-31');
      const total = items.reduce((s, x) => s + x.amount, 0);
      expect(total).toBe(line.actual);
    }

    // matchesDebtPaymentBudget konsisten dengan agregat & spesifik
    const txs = useData.getState().data.transactions;
    const aggMatched = txs.filter((t) => matchesDebtPaymentBudget(b, t));
    expect(aggMatched).toHaveLength(3); // 2 payable_pay + 1 transfer ke acc-loan
    const d1Matched = txs.filter((t) => matchesDebtPaymentBudget(b, t, d1.id));
    expect(d1Matched).toHaveLength(1);
  });

  it('menangani siklus hidup anggaran per-hutang: sebelum asal hutang diabaikan dan setelah lunas di bulan lalu tidak menggelembungkan total', () => {
    const { tx: d } = addTransaction({
      type: 'payable_new',
      date: '2026-02-10',
      amount: 1_000_000,
      accountId: SYS.cash,
      contact: 'Rekan',
      description: 'Pinjaman singkat',
    });
    addTransaction({
      type: 'payable_pay',
      date: '2026-02-20',
      amount: 1_000_000,
      accountId: SYS.cash,
      parentId: d.id,
      description: 'Pelunasan',
    });
    upsertBudget('acc-food', 2_000_000);
    upsertBudget({ kind: 'debt', debtId: d.id }, 1_000_000);

    const b = getBooks(useData.getState().data);

    // Januari 2026 (sebelum hutang dibuat 10 Feb) → anggaran per-hutang tidak muncul
    const jan = budgetVsActual(b, '2026-01-01', '2026-01-31');
    expect(jan.find((l) => l.key === `debt:${d.id}`)).toBeUndefined();

    // Februari 2026 (bulan pelunasan) → aktif & terhitung
    const feb = budgetVsActual(b, '2026-02-01', '2026-02-28');
    const febDebt = feb.find((l) => l.key === `debt:${d.id}`)!;
    expect(febDebt.actual).toBe(1_000_000);
    expect(febDebt.kind === 'debt' && febDebt.isPaidOff).toBe(true);
    expect(febDebt.kind === 'debt' && febDebt.activeInPeriod).toBe(true);
    expect(budgetSummary(feb).totalBudget).toBe(3_000_000);

    // Maret 2026 (sudah lunas sebelum 1 Mar & realisasi 0) → kartu tetap ada dengan isPaidOff=true, activeInPeriod=false, TIDAK masuk totalBudget
    const mar = budgetVsActual(b, '2026-03-01', '2026-03-31');
    const marDebt = mar.find((l) => l.key === `debt:${d.id}`)!;
    expect(marDebt.actual).toBe(0);
    expect(marDebt.kind === 'debt' && marDebt.isPaidOff).toBe(true);
    expect(marDebt.kind === 'debt' && marDebt.activeInPeriod).toBe(false);
    expect(budgetSummary(mar).totalBudget).toBe(2_000_000);
  });

  it('budgetThreeMonthAverage membagi hanya dengan jumlah bulan aktif dalam 3 bulan terakhir', () => {
    // Hanya ada pengeluaran di Januari (300rb) dan Februari (600rb); Desember nol
    addTransaction({ type: 'expense', date: '2026-01-10', amount: 300_000, accountId: 'acc-cash', categoryId: 'acc-food', description: 'Makan Jan' });
    addTransaction({ type: 'expense', date: '2026-02-10', amount: 600_000, accountId: 'acc-cash', categoryId: 'acc-food', description: 'Makan Feb' });

    const b = getBooks(useData.getState().data);
    const avg = budgetThreeMonthAverage(b, { kind: 'expense', categoryId: 'acc-food' }, '2026-03');
    expect(avg.activeMonths).toBe(2);
    expect(avg.average).toBe(450_000);

    const empty = budgetThreeMonthAverage(b, { kind: 'expense', categoryId: 'acc-transport' }, '2026-03');
    expect(empty).toEqual({ average: 0, activeMonths: 0 });
  });

  it('budgetBreakdown beban 100% cocok dengan actual termasuk refund, biaya transfer, bunga hutang, jurnal manual, dan penyusutan', () => {
    const { account: bank } = addAccount({ name: 'Rekening Bank', type: 'asset', subtype: 'bank', icon: 'landmark', color: '#0B4C72' });
    addTransaction({ type: 'expense', date: '2026-03-02', amount: 200_000, accountId: bank.id, categoryId: 'acc-food', description: 'Belanja' });
    // Pengembalian dana (refund): pemasukan ke akun beban
    addTransaction({ type: 'income', date: '2026-03-05', amount: 50_000, accountId: bank.id, categoryId: 'acc-food', description: 'Cashback' });
    // Transfer dengan biaya admin → SYS.bankFee
    addTransaction({ type: 'transfer', date: '2026-03-08', amount: 100_000, fee: 6_500, accountId: bank.id, toAccountId: SYS.cash, description: 'Tarik tunai' });
    // Aset tetap → penyusutan otomatis Maret 2026
    addAsset({
      name: 'Laptop',
      accountId: 'acc-equipment',
      acquisitionDate: '2026-02-01',
      cost: 12_000_000,
      residualValue: 0,
      usefulLifeMonths: 12,
      method: 'straight_line',
      funding: 'opening',
    });

    upsertBudget('acc-food', 500_000);
    upsertBudget(SYS.bankFee, 50_000);
    upsertBudget(SYS.depreciationExpense, 1_500_000);

    const b = getBooks(useData.getState().data);
    const lines = budgetVsActual(b, '2026-03-01', '2026-03-31');

    const food = lines.find((l) => l.key === 'expense:acc-food')!;
    expect(food.actual).toBe(150_000);
    const foodItems = budgetBreakdown(b, food, '2026-03-01', '2026-03-31');
    expect(foodItems.reduce((s, x) => s + x.amount, 0)).toBe(150_000);
    expect(foodItems.some((x) => x.isRefund && x.amount === -50_000)).toBe(true);

    const fee = lines.find((l) => l.key === `expense:${SYS.bankFee}`)!;
    expect(fee.actual).toBe(6_500);
    expect(budgetBreakdown(b, fee, '2026-03-01', '2026-03-31').reduce((s, x) => s + x.amount, 0)).toBe(6_500);

    const dep = lines.find((l) => l.key === `expense:${SYS.depreciationExpense}`)!;
    expect(dep.actual).toBe(1_000_000);
    const depItems = budgetBreakdown(b, dep, '2026-03-01', '2026-03-31');
    expect(depItems).toHaveLength(1);
    expect(depItems[0].source).toBe('depreciation');
    expect(depItems[0].amount).toBe(1_000_000);
  });

  it('budgetReport memisahkan anggaran hutang dari JUMLAH BEBAN dan menyertakan accountId pada baris tanpa anggaran', () => {
    const { tx: d } = addTransaction({ type: 'payable_new', date: '2026-03-01', amount: 2_000_000, accountId: SYS.cash, contact: 'Bank A', description: 'Kredit' });
    addTransaction({ type: 'payable_pay', date: '2026-03-10', amount: 500_000, interest: 50_000, accountId: SYS.cash, parentId: d.id, description: 'Angsuran' });
    addTransaction({ type: 'expense', date: '2026-03-03', amount: 300_000, accountId: SYS.cash, categoryId: 'acc-food', description: 'Makan' });
    addTransaction({ type: 'expense', date: '2026-03-04', amount: 120_000, accountId: SYS.cash, categoryId: 'acc-transport', description: 'Transport' });
    upsertBudget('acc-food', 500_000);
    upsertBudget({ kind: 'debt' }, 1_000_000);

    const rep = budgetReport(getBooks(useData.getState().data), { from: '2026-03-01', to: '2026-03-31', label: 'Maret 2026' }, 'Uji');
    // Unbudgeted row memiliki accountId agar bisa klik ke Buku Besar
    const uTrans = rep.rows.find((r) => r.key === 'u-acc-transport');
    expect(uTrans?.accountId).toBe('acc-transport');

    // JUMLAH BEBAN = 300rb (makan) + 120rb (transport) + 50rb (bunga pinjaman) = 470rb — pokok hutang 500rb TIDAK masuk beban!
    const totalBeban = rep.rows.find((r) => r.key === 't-all')!;
    expect(totalBeban.values[1]).toBe(470_000);

    // Bagian terpisah ANGGARAN PEMBAYARAN HUTANG ada dengan realisasi 550rb
    const debtRow = rep.rows.find((r) => r.key === 'd-all');
    expect(debtRow?.values[0]).toBe(1_000_000);
    expect(debtRow?.values[1]).toBe(550_000);
  });

  it('checkIntegrity melaporkan nama kategori invalid dan referensi hutang yatim pada anggaran', () => {
    const d = emptyData();
    d.budgets = [
      { id: 'bg1', categoryId: SYS.cash, amount: 1_000_000, createdAt: 1 },
      { id: 'bg2', kind: 'debt', debtId: 'tx-hilang', amount: 500_000, createdAt: 2 },
    ];
    const issues = checkIntegrity(d);
    const accIssue = issues.find((i) => i.code === 'budget-account');
    const debtIssue = issues.find((i) => i.code === 'budget-debt');
    expect(accIssue?.message).toContain('Kas Tunai');
    expect(debtIssue).toBeDefined();
  });
});
