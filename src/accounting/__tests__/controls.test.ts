import { beforeEach, describe, expect, it } from 'vitest';
import { addTransaction, deleteTransactions, emptyData, normalizeData, replaceData, updateAsset, updateProfile, updateTransaction, useData } from '../../store/data';
import { SYS } from '../coa';
import { buildJournal, entryTotals } from '../engine';
import { checkIntegrity } from '../integrity';
import { isLocked, lockViolations } from '../lock';
import { balancesAt, bal, getBooks } from '../reports';
import type { Account, AppData, FixedAsset, Transaction } from '../types';
import { addMonths, compactNumber, round2, startOfMonth, todayISO } from '../../lib/format';

let seq = 0;
const tx = (t: Partial<Transaction> & Pick<Transaction, 'type' | 'date'>): Transaction => {
  seq++;
  return { id: 'c' + seq, amount: 0, description: '', ref: `C/${seq}`, createdAt: seq * 1_000_000, updatedAt: seq, ...t } as Transaction;
};
const BANK = 'acc-bank-ctl';
const bank: Account = { id: BANK, code: '1-1200', name: 'Bank', subtype: 'bank', type: 'asset', icon: 'landmark', color: '#000', createdAt: 1 };

function base(): AppData {
  const d = emptyData();
  d.accounts.push(bank);
  d.transactions.push(tx({ type: 'opening', date: '2025-01-01', amount: 200_000_000, accountId: BANK }));
  return d;
}

const asset = (p: Partial<FixedAsset>): FixedAsset => ({
  id: 'fa' + ++seq,
  name: 'Mobil',
  accountId: 'acc-vehicle',
  acquisitionDate: '2025-01-15',
  cost: 120_000_000,
  residualValue: 0,
  usefulLifeMonths: 60,
  method: 'straight_line',
  funding: 'wallet',
  paidFromAccountId: BANK,
  ref: 'AST/2025/01/0001',
  createdAt: seq,
  ...p,
});

describe('pembulatan & angka ringkas', () => {
  it('round2 tepat untuk nominal besar dan sangat kecil', () => {
    expect(round2(10_000.005)).toBe(10_000.01);
    expect(round2(-10_000.005)).toBe(-10_000.01);
    expect(round2(123_456_789.125)).toBe(123_456_789.13);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1e-7)).toBe(0);
    expect(round2(Infinity)).toBe(0);
  });

  it('angka ringkas naik satuan saat pembulatan menembus 1.000', () => {
    expect(compactNumber(999_999)).toBe('1 jt');
    expect(compactNumber(999.6)).toBe('1 rb');
    expect(compactNumber(1_250_000)).toBe('1,25 jt');
    expect(compactNumber(54_202_500)).toBe('54,2 jt');
    expect(compactNumber(950)).toBe('950');
  });
});

describe('pelepasan aset', () => {
  it('pelepasan bertanggal mendatang: akumulasi penyusutan & nilai aset habis tepat di tanggal pelepasan', () => {
    const today = todayISO();
    const acq = startOfMonth(addMonths(today, -6));
    const disp = addMonths(today, 3);
    const d = base();
    d.assets.push(asset({ acquisitionDate: acq, disposal: { date: disp, proceeds: 100_000_000, accountId: BANK } }));
    for (const e of buildJournal(d)) expect(entryTotals(e).balanced, e.ref).toBe(true);
    const b = getBooks(d);
    const m = balancesAt(b, disp);
    expect(bal(b.acc.get(SYS.accumDepreciation)!, m)).toBe(0);
    expect(bal(b.acc.get('acc-vehicle')!, m)).toBe(0);
    expect(checkIntegrity(d).filter((i) => i.level === 'error')).toEqual([]);
  });

  it('akun penerimaan pelepasan hilang: pelepasan tidak dijurnal, penyusutan tetap berjalan, dan dilaporkan', () => {
    const d = base();
    d.assets.push(asset({ disposal: { date: '2025-06-10', proceeds: 1, accountId: 'acc-tidak-ada' } }));
    const js = buildJournal(d);
    expect(js.some((e) => e.source === 'disposal')).toBe(false);
    expect(js.filter((e) => e.source === 'depreciation' && e.date > '2025-06-10').length).toBeGreaterThan(0);
    expect(checkIntegrity(d).some((i) => i.code === 'asset-disposal-account')).toBe(true);
  });
});

describe('kunci periode', () => {
  const LOCK = '2025-06-30';

  it('lockViolations mendeteksi tambah, ubah, hapus, dan pindah tanggal ke periode terkunci', () => {
    const prev = base();
    prev.profile.lockDate = LOCK;
    const old = tx({ type: 'expense', date: '2025-05-02', amount: 10_000, accountId: BANK, categoryId: 'acc-food' });
    const open = tx({ type: 'expense', date: '2025-07-02', amount: 10_000, accountId: BANK, categoryId: 'acc-food' });
    prev.transactions.push(old, open);
    const at = (fn: (d: AppData) => AppData) => lockViolations(prev, fn(prev));

    expect(at((d) => ({ ...d, transactions: [...d.transactions, tx({ type: 'income', date: '2025-06-30', amount: 1, accountId: BANK, categoryId: 'acc-salary' })] }))).toHaveLength(1);
    expect(at((d) => ({ ...d, transactions: [...d.transactions, tx({ type: 'income', date: '2025-07-01', amount: 1, accountId: BANK, categoryId: 'acc-salary' })] }))).toHaveLength(0);
    expect(at((d) => ({ ...d, transactions: d.transactions.map((t) => (t.id === old.id ? { ...t, note: 'x' } : t)) }))).toHaveLength(1);
    expect(at((d) => ({ ...d, transactions: d.transactions.filter((t) => t.id !== old.id) }))).toHaveLength(1);
    // memindahkan transaksi terbuka ke dalam periode terkunci juga ditolak
    expect(at((d) => ({ ...d, transactions: d.transactions.map((t) => (t.id === open.id ? { ...t, date: '2025-06-01' } : t)) }))).toHaveLength(1);
    expect(at((d) => ({ ...d, transactions: d.transactions.map((t) => (t.id === open.id ? { ...t, amount: 5 } : t)) }))).toHaveLength(0);
    // mengubah tanggal kunci itu sendiri selalu boleh
    expect(at((d) => ({ ...d, profile: { ...d.profile, lockDate: undefined } }))).toHaveLength(0);
    expect(isLocked('2025-06-30', LOCK)).toBe(true);
    expect(isLocked('2025-07-01', LOCK)).toBe(false);
    expect(isLocked('2025-01-01', undefined)).toBe(false);
  });

  it('aset: perubahan nilai aset lama dan pelepasan di periode terkunci ditolak; pelepasan sesudahnya boleh', () => {
    const prev = base();
    prev.profile.lockDate = LOCK;
    const a = asset({});
    prev.assets.push(a);
    const withAsset = (patch: Partial<FixedAsset>) => lockViolations(prev, { ...prev, assets: [{ ...a, ...patch }] });
    expect(withAsset({ cost: 1 })).toHaveLength(1);
    expect(withAsset({ name: 'Mobil keluarga' })).toHaveLength(0);
    expect(withAsset({ disposal: { date: '2025-06-15', proceeds: 1, accountId: BANK } })).toHaveLength(1);
    expect(withAsset({ disposal: { date: '2025-08-15', proceeds: 1, accountId: BANK } })).toHaveLength(0);
  });

  describe('lewat store (satu pintu untuk semua formulir)', () => {
    beforeEach(() => {
      const d = base();
      d.profile.lockDate = LOCK;
      d.transactions.push(tx({ id: 'locked-1', type: 'expense', date: '2025-03-01', amount: 50_000, accountId: BANK, categoryId: 'acc-food' }));
      d.assets.push(asset({ id: 'fa-locked' }));
      useData.setState({ data: d, past: [], future: [], lastId: null });
    });

    it('menolak perubahan tanpa mengubah data maupun riwayat', () => {
      const before = useData.getState().data;
      expect(addTransaction({ type: 'income', date: '2025-06-01', amount: 1, accountId: BANK, categoryId: 'acc-salary', description: '' }).historyId).toBe('');
      expect(updateTransaction('locked-1', { amount: 1 })).toBe('');
      expect(deleteTransactions(['locked-1'])).toBe('');
      expect(updateAsset('fa-locked', { cost: 1 })).toBe('');
      expect(useData.getState().data).toBe(before);
      expect(useData.getState().past).toHaveLength(0);
    });

    it('mengizinkan periode terbuka, membuka kunci, dan pulihkan cadangan', () => {
      expect(addTransaction({ type: 'income', date: '2025-07-01', amount: 1, accountId: BANK, categoryId: 'acc-salary', description: '' }).historyId).not.toBe('');
      expect(updateProfile({ lockDate: undefined })).not.toBe('');
      expect(deleteTransactions(['locked-1'])).not.toBe('');
      useData.getState().undo();
      useData.getState().undo();
      expect(useData.getState().data.profile.lockDate).toBe(LOCK);
      expect(replaceData(normalizeData(emptyData()), 'Pulihkan')).not.toBe('');
    });
  });

  it('nominal jurnal manual selalu = total debit barisnya (data lama bernominal 0 ikut diperbaiki)', () => {
    const d = base();
    d.transactions.push(
      tx({
        type: 'journal',
        date: '2025-03-31',
        amount: 0,
        lines: [
          { accountId: 'acc-utilities', debit: 185_000, credit: 0 },
          { accountId: 'acc-accrued', debit: 0, credit: 185_000 },
        ],
      }),
    );
    expect(normalizeData(d).transactions.find((t) => t.type === 'journal')!.amount).toBe(185_000);
  });

  it('normalizeData hanya menerima tanggal kunci yang valid', () => {
    const d = emptyData();
    expect(normalizeData({ ...d, profile: { ...d.profile, lockDate: '2025-12-31' } }).profile.lockDate).toBe('2025-12-31');
    expect(normalizeData({ ...d, profile: { ...d.profile, lockDate: 'kemarin' } }).profile.lockDate).toBeUndefined();
  });
});

describe('pemeriksaan integritas tambahan', () => {
  it('menandai transfer ke akun yang sama', () => {
    const d = base();
    d.transactions.push(tx({ type: 'transfer', date: '2025-02-01', amount: 1_000, fee: 2_500, accountId: BANK, toAccountId: BANK }));
    expect(checkIntegrity(d).some((i) => i.code === 'transfer-same-account')).toBe(true);
  });

  it('menandai isian identik yang disimpan berselang < 1 menit, bukan yang berbeda jam', () => {
    const d = base();
    const one = { type: 'expense' as const, date: '2025-02-03', time: '08:15', amount: 28_000, accountId: BANK, categoryId: 'acc-food', description: 'Kopi' };
    d.transactions.push({ ...tx(one), createdAt: 5_000_000_000 }, { ...tx(one), createdAt: 5_000_020_000 });
    expect(checkIntegrity(d).filter((i) => i.code === 'possible-duplicate')).toHaveLength(1);

    const e = base();
    e.transactions.push({ ...tx(one), createdAt: 5_000_000_000 }, { ...tx({ ...one, time: '16:40' }), createdAt: 5_000_020_000 });
    expect(checkIntegrity(e).some((i) => i.code === 'possible-duplicate')).toBe(false);
  });
});
