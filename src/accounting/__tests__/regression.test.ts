import { beforeEach, describe, expect, it } from 'vitest';
import { addAccount, addAsset, createWallet, emptyData, normalizeData, updateAccount, updateAsset, updateWallet, useData } from '../../store/data';
import { budgetReport, debtInfos, displayBalances, getBooks } from '../reports';
import { cashDelta, txView } from '../../components/tx/txDisplay';
import type { AppData, FixedAsset, Transaction } from '../types';

let seq = 0;
const tx = (t: Partial<Transaction> & Pick<Transaction, 'type' | 'date'>): Transaction => {
  seq++;
  return { id: 'r' + seq, amount: 0, description: '', ref: `R/${seq}`, createdAt: seq, updatedAt: seq, ...t } as Transaction;
};

describe('perbaikan regresi & konsistensi data', () => {
  beforeEach(() => useData.setState({ data: emptyData(), past: [], future: [], lastId: null }));

  it('normalizeData mengisi ref aset kosong secara berurutan tanpa bertabrakan', () => {
    const d = emptyData();
    const mk = (id: string, ref = ''): FixedAsset => ({
      id,
      name: id,
      accountId: 'acc-equipment',
      acquisitionDate: '2026-03-10',
      cost: 1_000_000,
      residualValue: 0,
      usefulLifeMonths: 12,
      method: 'straight_line',
      funding: 'opening',
      ref,
      createdAt: 1,
    });
    d.assets.push(mk('a1'), mk('a2'), mk('a3'));
    const norm = normalizeData(d);
    expect(norm.assets.map((a) => a.ref)).toEqual(['AST/2026/03/0001', 'AST/2026/03/0002', 'AST/2026/03/0003']);
  });

  it('createWallet, updateAccount, dan updateWallet menyelaraskan account.type dengan SUBTYPE_META', () => {
    const { account: custom } = addAccount({
      name: 'Piutang Klien',
      subtype: 'receivable',
      type: 'asset',
      icon: 'file-text',
      color: '#111111',
    });
    updateAccount(custom.id, { subtype: 'payable' });
    const updatedAcc = useData.getState().data.accounts.find((a) => a.id === custom.id)!;
    expect(updatedAcc.subtype).toBe('payable');
    expect(updatedAcc.type).toBe('liability');

    const { account: inv } = createWallet({ name: 'Reksa Dana', subtype: 'investment', icon: 'trending-up', color: '#163300' });
    expect(inv.type).toBe('asset');

    const { account: cc } = createWallet({ name: 'Kartu Kredit', subtype: 'credit_card', icon: 'credit-card', color: '#222222' });
    expect(cc.type).toBe('liability');

    const { account: loan } = createWallet({ name: 'Pinjaman Bank', subtype: 'loan', icon: 'landmark', color: '#333333' });
    expect(loan.type).toBe('liability');

    updateWallet(cc.id, { subtype: 'bank' }, { amount: 0, date: '2026-01-01' });
    const updatedW = useData.getState().data.accounts.find((a) => a.id === cc.id)!;
    expect(updatedW.subtype).toBe('bank');
    expect(updatedW.type).toBe('asset');
  });

  it('addAsset & updateAsset menormalisasi nilai angka dan mempertahankan hapus pelepasan', () => {
    const { asset } = addAsset({
      name: '  Laptop Studio  ',
      accountId: 'acc-equipment',
      acquisitionDate: '2026-01-10',
      cost: -12_000_000.456,
      residualValue: -500_000,
      usefulLifeMonths: 0,
      method: 'straight_line',
      funding: 'opening',
    });
    expect(asset.name).toBe('Laptop Studio');
    expect(asset.cost).toBe(12_000_000.46);
    expect(asset.residualValue).toBe(0);
    expect(asset.usefulLifeMonths).toBe(1);

    updateAsset(asset.id, {
      name: ' Laptop Pro ',
      cost: 15_000_000,
      disposal: { date: '2026-06-01', proceeds: -2_000_000, accountId: 'acc-cash' },
    });
    const afterDispose = useData.getState().data.assets.find((a) => a.id === asset.id)!;
    expect(afterDispose.name).toBe('Laptop Pro');
    expect(afterDispose.cost).toBe(15_000_000);
    expect(afterDispose.disposal?.proceeds).toBe(0);

    updateAsset(asset.id, { disposal: undefined });
    const afterClear = useData.getState().data.assets.find((a) => a.id === asset.id)!;
    expect(afterClear.disposal).toBeUndefined();
  });

  it('txView dan cashDelta selaras dengan engine pada hutang/piutang lama (counter undefined)', () => {
    const d = emptyData();
    const accMap = new Map(d.accounts.map((a) => [a.id, a]));
    const payWallet = tx({ type: 'payable_new', date: '2026-04-01', amount: 1_000_000, accountId: 'acc-cash', contact: 'Andi' });
    const payOpening = tx({ type: 'payable_new', date: '2026-04-01', amount: 1_000_000, counter: 'opening', accountId: 'acc-cash', contact: 'Andi' });
    const recWallet = tx({ type: 'receivable_new', date: '2026-04-02', amount: 750_000, accountId: 'acc-cash', contact: 'Budi' });
    const recCategory = tx({ type: 'receivable_new', date: '2026-04-02', amount: 750_000, counter: 'category', categoryId: 'acc-salary', contact: 'Klien' });

    expect(txView(payWallet, accMap).sign).toBe(1);
    expect(txView(payWallet, accMap).subtitle).toContain('Kas');
    expect(cashDelta(payWallet)).toBe(1_000_000);

    expect(txView(payOpening, accMap).sign).toBe(0);
    expect(txView(payOpening, accMap).subtitle).toContain('saldo awal');
    expect(cashDelta(payOpening)).toBe(0);

    expect(txView(recWallet, accMap).sign).toBe(-1);
    expect(cashDelta(recWallet)).toBe(-750_000);

    expect(txView(recCategory, accMap).sign).toBe(0);
    expect(cashDelta(recCategory)).toBe(0);
  });

  it('displayBalances menghitung saldo kumulatif akun neraca dan saldo FYTD akun nominal', () => {
    const d = emptyData();
    d.transactions.push(
      tx({ type: 'opening', date: '2025-01-01', amount: 5_000_000, accountId: 'acc-cash' }),
      tx({ type: 'income', date: '2025-11-15', amount: 3_000_000, accountId: 'acc-cash', categoryId: 'acc-salary' }),
      tx({ type: 'income', date: '2026-02-10', amount: 4_000_000, accountId: 'acc-cash', categoryId: 'acc-salary' }),
    );
    const b = getBooks(d);
    const balOf = displayBalances(b, '2026-04-30');
    const cashAcc = b.acc.get('acc-cash')!;
    const salaryAcc = b.acc.get('acc-salary')!;
    expect(balOf(cashAcc)).toBe(12_000_000);
    expect(balOf(salaryAcc)).toBe(4_000_000);
  });

  it('budgetReport menyertakan metadata formula pada st-b, st-u, dan t-all', () => {
    const d: AppData = emptyData();
    d.transactions.push(
      tx({ type: 'opening', date: '2026-01-01', amount: 10_000_000, accountId: 'acc-cash' }),
      tx({ type: 'expense', date: '2026-04-05', amount: 400_000, accountId: 'acc-cash', categoryId: 'acc-food' }),
      tx({ type: 'expense', date: '2026-04-06', amount: 150_000, accountId: 'acc-cash', categoryId: 'acc-transport' }),
    );
    d.budgets.push({ id: 'b1', categoryId: 'acc-food', amount: 1_000_000, month: '2026-04' });

    const rep = budgetReport(getBooks(d), { from: '2026-04-01', to: '2026-04-30', label: 'April 2026' }, 'Uji');
    const stB = rep.rows.find((r) => r.key === 'st-b');
    const stU = rep.rows.find((r) => r.key === 'st-u');
    const tAll = rep.rows.find((r) => r.key === 't-all');

    expect(stB?.formula).toEqual({ plus: ['a-acc-food'] });
    expect(stU?.formula).toEqual({ plus: ['u-acc-transport'] });
    expect(tAll?.formula).toEqual({ plus: ['st-b', 'st-u'] });
    expect(tAll?.values).toEqual([1_000_000, 550_000, 450_000, 55]);
  });

  it('debtInfos membedakan piutang yang dihapusbukukan penuh maupun sebagian', () => {
    const d = emptyData();
    const p1 = tx({ id: 'p-full', type: 'receivable_new', date: '2026-01-01', amount: 500_000, accountId: 'acc-cash', contact: 'Budi', ref: 'PTG/1' });
    const p2 = tx({ id: 'p-part', type: 'receivable_new', date: '2026-01-02', amount: 500_000, accountId: 'acc-cash', contact: 'Siti', ref: 'PTG/2' });
    d.transactions.push(
      p1,
      tx({ type: 'receivable_writeoff', parentId: p1.id, date: '2026-02-01', amount: 500_000 }),
      p2,
      tx({ type: 'receivable_collect', parentId: p2.id, date: '2026-01-15', amount: 300_000, accountId: 'acc-cash' }),
      tx({ type: 'receivable_writeoff', parentId: p2.id, date: '2026-02-01', amount: 200_000 }),
    );
    const infos = debtInfos(d, '2026-03-01');
    const fullWo = infos.find((x) => x.tx.id === p1.id)!;
    const partWo = infos.find((x) => x.tx.id === p2.id)!;
    expect(fullWo.paid).toBe(0);
    expect(fullWo.writtenOff).toBe(500_000);
    expect(fullWo.remaining).toBe(0);
    expect(partWo.paid).toBe(300_000);
    expect(partWo.writtenOff).toBe(200_000);
    expect(partWo.remaining).toBe(0);
  });
});
