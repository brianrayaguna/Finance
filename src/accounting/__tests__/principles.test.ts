/*
 * Regresi audit prinsip akuntansi (Nov 2026): penyusutan saldo menurun ganda, DSR, jurnal penutup
 * manual, dan TIE. Angka acuan diambil dari definisi buku teks / PSAK, bukan dari keluaran kode.
 */
import { describe, expect, it } from 'vitest';
import { emptyData } from '../../store/data';
import { depreciationSchedule } from '../engine';
import { checkIntegrity } from '../integrity';
import { getBooks, ratios } from '../reports';
import { round2 } from '../../lib/format';
import type { Account, FixedAsset, Transaction } from '../types';

let n = 0;
const tx = (t: Partial<Transaction> & Pick<Transaction, 'type' | 'date'>): Transaction => {
  n++;
  return { id: 'pr' + n, amount: 0, description: '', ref: `PR/${n}`, createdAt: n * 100_000, updatedAt: n, ...t } as Transaction;
};
const acc = (id: string, code: string, subtype: Account['subtype'], type: Account['type']): Account => ({ id, code, name: id, subtype, type, icon: 'tag', color: '#000', createdAt: 1 });
const asset = (p: Partial<FixedAsset> = {}): FixedAsset => ({
  id: 'fa', name: 'Aset', accountId: 'acc-equipment', acquisitionDate: '2025-01-10', cost: 12_000_000, residualValue: 0, usefulLifeMonths: 48,
  method: 'declining_balance', funding: 'opening', ref: 'AST/1', createdAt: 5, ...p,
});
const yearly = (rows: { amount: number }[]) => {
  const out: number[] = [];
  for (let i = 0; i < rows.length; i += 12) out.push(round2(rows.slice(i, i + 12).reduce((s, r) => s + r.amount, 0)));
  return out;
};
const FY = { from: '2026-01-01', to: '2026-12-31', label: '2026' };

describe('saldo menurun ganda: tarif tahunan 2 ÷ umur atas nilai buku awal tahun', () => {
  it('umur 4 tahun: 50% tahun pertama, lalu beralih ke garis lurus', () => {
    const rows = depreciationSchedule(asset());
    expect(rows).toHaveLength(48);
    // 12 jt × 50% = 6 jt; 6 jt × 50% = 3 jt; sisa 3 jt dibagi rata 2 tahun (garis lurus lebih besar)
    expect(yearly(rows)).toEqual([6_000_000, 3_000_000, 1_500_000, 1_500_000]);
    expect(rows[0].amount).toBe(500_000); // beban tahunan ÷ 12, tidak dimajemukkan per bulan
    expect(rows[rows.length - 1].book).toBe(0);
  });

  it('umur 5 tahun dengan nilai sisa: tidak pernah di bawah nilai sisa', () => {
    const rows = depreciationSchedule(asset({ cost: 20_000_000, residualValue: 1_000_000, usefulLifeMonths: 60 }));
    // tarif 40%: tahun 1 = 8 jt, tahun 2 = 4,8 jt
    expect(yearly(rows).slice(0, 2)).toEqual([8_000_000, 4_800_000]);
    expect(rows[rows.length - 1].book).toBe(1_000_000);
    expect(round2(rows.reduce((s, r) => s + r.amount, 0))).toBe(19_000_000);
  });

  it('garis lurus tidak berubah', () => {
    expect(yearly(depreciationSchedule(asset({ method: 'straight_line' })))).toEqual([3_000_000, 3_000_000, 3_000_000, 3_000_000]);
  });
});

describe('DSR: pokok + bunga dibayar dari kas, semua jalur', () => {
  it('cicilan KPR (jangka panjang), pinjaman, dan bunga sebagai pengeluaran ikut dihitung', () => {
    const d = emptyData();
    d.accounts.push(acc('kpr', '2-2100', 'long_term_liability', 'liability'), acc('pinj', '2-1500', 'loan', 'liability'), acc('cc', '2-1200', 'credit_card', 'liability'));
    d.transactions.push(
      tx({ type: 'opening', date: '2026-01-01', amount: 100_000_000, accountId: 'acc-cash' }),
      tx({ type: 'opening', date: '2026-01-01', amount: 50_000_000, accountId: 'kpr' }),
      tx({ type: 'opening', date: '2026-01-01', amount: 50_000_000, accountId: 'pinj' }),
      tx({ type: 'income', date: '2026-02-01', amount: 10_000_000, accountId: 'acc-cash', categoryId: 'acc-salary' }),
      tx({ type: 'expense', date: '2026-02-03', amount: 1_000_000, accountId: 'acc-cash', categoryId: 'acc-interest-expense' }),
      tx({ type: 'transfer', date: '2026-02-04', amount: 2_000_000, fee: 6_500, accountId: 'acc-cash', toAccountId: 'kpr' }),
      tx({ type: 'transfer', date: '2026-02-05', amount: 2_000_000, accountId: 'acc-cash', toAccountId: 'pinj' }),
      // pelunasan tagihan kartu kredit bukan cicilan pinjaman
      tx({ type: 'transfer', date: '2026-02-06', amount: 3_000_000, accountId: 'acc-cash', toAccountId: 'cc' }),
      // meminjam (kas masuk) bukan pembayaran
      tx({ type: 'transfer', date: '2026-02-07', amount: 5_000_000, accountId: 'pinj', toAccountId: 'acc-cash' }),
    );
    const dsr = ratios(getBooks(d), FY).find((r) => r.name.includes('DSR'))!;
    expect(dsr.value).toBeCloseTo(0.5, 6); // (2 + 2 + 1) ÷ 10
    expect(dsr.status).toBe('bad');
  });

  it('pembayaran hutang beserta bunganya tetap dihitung', () => {
    const d = emptyData();
    const origin = tx({ type: 'payable_new', date: '2026-01-05', amount: 4_000_000, accountId: 'acc-cash', contact: 'Budi' });
    d.transactions.push(
      tx({ type: 'income', date: '2026-01-02', amount: 10_000_000, accountId: 'acc-cash', categoryId: 'acc-salary' }),
      origin,
      tx({ type: 'payable_pay', date: '2026-02-05', amount: 1_000_000, interest: 100_000, accountId: 'acc-cash', parentId: origin.id }),
    );
    const dsr = ratios(getBooks(d), FY).find((r) => r.name.includes('DSR'))!;
    expect(dsr.value).toBeCloseTo(0.11, 6);
  });
});

describe('TIE memakai EBIT (laba bersih + bunga + pajak)', () => {
  it('pajak ditambahkan kembali', () => {
    const d = emptyData();
    d.transactions.push(
      tx({ type: 'opening', date: '2026-01-01', amount: 10_000_000, accountId: 'acc-cash' }),
      tx({ type: 'income', date: '2026-02-01', amount: 10_000_000, accountId: 'acc-cash', categoryId: 'acc-salary' }),
      tx({ type: 'expense', date: '2026-02-02', amount: 1_000_000, accountId: 'acc-cash', categoryId: 'acc-tax' }),
      tx({ type: 'expense', date: '2026-02-03', amount: 1_000_000, accountId: 'acc-cash', categoryId: 'acc-interest-expense' }),
    );
    const tie = ratios(getBooks(d), FY).find((r) => r.name.includes('TIE'))!;
    expect(tie.value).toBe(10); // EBIT 10 jt ÷ bunga 1 jt
  });
});

describe('jurnal penutup manual ditandai', () => {
  const closing = (credit: string) => {
    const d = emptyData();
    d.transactions.push(
      tx({ type: 'income', date: '2026-03-01', amount: 5_000_000, accountId: 'acc-cash', categoryId: 'acc-salary' }),
      tx({ type: 'journal', date: '2026-12-31', amount: 5_000_000, lines: [
        { accountId: 'acc-salary', debit: 5_000_000, credit: 0 },
        { accountId: credit, debit: 0, credit: 5_000_000 },
      ] }),
    );
    return checkIntegrity(d).filter((i) => i.code === 'manual-closing');
  };
  it('ke Ikhtisar Laba Rugi', () => expect(closing('acc-income-summary')).toHaveLength(1));
  it('langsung ke Saldo Laba', () => expect(closing('acc-retained')).toHaveLength(1));
  it('jurnal biasa tidak ditandai', () => expect(closing('acc-cash')).toHaveLength(0));
});
