import { beforeEach, describe, expect, it } from 'vitest';
import { emptyData, normalizeData, updateWallet, useData } from '../../store/data';
import { SYS } from '../coa';
import { buildJournal, depreciationSchedule, entryTotals, journalizeTx, makeCtx } from '../engine';
import { checkIntegrity } from '../integrity';
import {
  balanceSheet,
  cashFlowStatement,
  closingEntries,
  equityStatement,
  getBooks,
  incomeStatement,
  ratios,
  trialBalance,
  worksheet,
} from '../reports';
import { makeDates, makePeriods } from '../periods';
import type { Account, AppData, FixedAsset, Transaction } from '../types';
import { round2 } from '../../lib/format';

let seq = 0;
const tx = (t: Partial<Transaction> & Pick<Transaction, 'type' | 'date'>): Transaction => {
  seq++;
  return { id: 't' + seq, amount: 0, description: '', ref: `X/${seq}`, createdAt: seq, updatedAt: seq, ...t } as Transaction;
};
const acc = (id: string, code: string, subtype: Account['subtype'], type: Account['type']): Account => ({
  id, code, name: id, subtype, type, icon: 'tag', color: '#000', createdAt: 1,
});
const BANK = 'acc-bank-test';
const CC = 'acc-cc-test';

function base(): AppData {
  const d = emptyData();
  d.accounts.push(acc(BANK, '1-1200', 'bank', 'asset'), acc(CC, '2-1200', 'credit_card', 'liability'));
  return d;
}

function allChecksPass(d: AppData, from: string, to: string) {
  const b = getBooks(d);
  for (const compare of [false, true]) {
    const periods = makePeriods(from, to, compare);
    const reps = [
      incomeStatement(b, periods, 'X'),
      balanceSheet(b, makeDates(to, compare, from), 'X'),
      cashFlowStatement(b, periods, 'X'),
      equityStatement(b, periods[0], 'X'),
      trialBalance(b, to, 'X'),
      worksheet(b, periods[0], 'X'),
    ];
    for (const r of reps) for (const c of r.checks ?? []) expect(c.ok, `${r.title}: ${c.label} (${c.diff})`).toBe(true);
  }
}

describe('round2', () => {
  it('simetris untuk bilangan negatif & aman terhadap NaN', () => {
    expect(round2(2.345)).toBe(2.35);
    expect(round2(-2.345)).toBe(-2.35);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(-1.005)).toBe(-1.01);
    expect(round2(NaN)).toBe(0);
    expect(Object.is(round2(-0.001), 0)).toBe(true);
  });
});

describe('jurnal manual', () => {
  it('jurnal tidak seimbang tidak diposting dan dilaporkan', () => {
    const d = base();
    d.transactions.push(
      tx({ type: 'journal', date: '2026-01-05', lines: [{ accountId: BANK, debit: 100, credit: 0 }, { accountId: SYS.capital, debit: 0, credit: 90 }] }),
    );
    expect(buildJournal(d)).toHaveLength(0);
    const issues = checkIntegrity(d);
    expect(issues.some((i) => i.code === 'not-journalized' && /tidak seimbang/.test(i.message))).toBe(true);
  });

  it('baris dengan akun hilang menolak seluruh jurnal (bukan melewatkan baris)', () => {
    const d = base();
    const t = tx({
      type: 'journal',
      date: '2026-01-05',
      lines: [
        { accountId: BANK, debit: 100, credit: 0 },
        { accountId: SYS.capital, debit: 0, credit: 60 },
        { accountId: 'acc-hilang', debit: 0, credit: 40 },
      ],
    });
    d.transactions.push(t);
    expect(journalizeTx(t, makeCtx(d))).toBeNull();
    for (const e of buildJournal(d)) expect(entryTotals(e).balanced).toBe(true);
  });
});

describe('neraca saldo & neraca lajur', () => {
  it('seimbang walau ada dua akun saldo laba', () => {
    const d = base();
    d.accounts.push(acc('acc-re-2', '3-2100', 'retained_earnings', 'equity'));
    d.transactions.push(
      tx({ type: 'opening', date: '2025-01-01', amount: 1000, accountId: BANK }),
      tx({ type: 'income', date: '2025-06-01', amount: 500, accountId: BANK, categoryId: 'acc-salary' }),
      tx({ type: 'journal', date: '2025-07-01', lines: [{ accountId: BANK, debit: 50, credit: 0 }, { accountId: 'acc-re-2', debit: 0, credit: 50 }] }),
      tx({ type: 'expense', date: '2026-02-01', amount: 200, accountId: BANK, categoryId: 'acc-food' }),
    );
    const b = getBooks(d);
    const tb = trialBalance(b, '2026-03-31', 'X');
    expect(tb.checks![0].ok).toBe(true);
    // laba 2025 (500) hanya masuk ke satu akun saldo laba
    const re = tb.rows.find((r) => r.accountId === SYS.retained)!;
    expect(re.values).toEqual([0, 500]);
    allChecksPass(d, '2026-01-01', '2026-03-31');
  });

  it('tidak menyuntik laba tahun lalu dua kali bila saldo akun saldo laba menjadi nol', () => {
    const d = base();
    d.transactions.push(
      tx({ type: 'opening', date: '2025-01-01', amount: 1000, accountId: BANK }),
      tx({ type: 'income', date: '2025-06-01', amount: 300, accountId: BANK, categoryId: 'acc-salary' }),
      // prive tahun lalu dibebankan langsung ke saldo laba sebesar laba tahun lalu
      tx({ type: 'journal', date: '2025-12-31', lines: [{ accountId: SYS.retained, debit: 300, credit: 0 }, { accountId: BANK, debit: 0, credit: 300 }] }),
    );
    const tb = trialBalance(getBooks(d), '2026-01-31', 'X');
    expect(tb.checks![0].ok).toBe(true);
    allChecksPass(d, '2026-01-01', '2026-01-31');
  });
});

describe('jurnal penutup', () => {
  it('menutup tiap akun prive sebesar saldonya sendiri', () => {
    const d = base();
    d.accounts.push(acc('acc-drawing-2', '3-3100', 'drawing', 'equity'));
    d.transactions.push(
      tx({ type: 'opening', date: '2026-01-01', amount: 1000, accountId: BANK }),
      tx({ type: 'journal', date: '2026-02-01', lines: [{ accountId: SYS.drawing, debit: 100, credit: 0 }, { accountId: BANK, debit: 0, credit: 100 }] }),
      tx({ type: 'journal', date: '2026-02-02', lines: [{ accountId: 'acc-drawing-2', debit: 40, credit: 0 }, { accountId: BANK, debit: 0, credit: 40 }] }),
    );
    const closing = closingEntries(getBooks(d), { from: '2026-01-01', to: '2026-12-31', label: '' });
    const drawEntry = closing.find((e) => /prive/.test(e.title))!;
    const d_ = drawEntry.lines.reduce((s, l) => s + l.debit, 0);
    const c_ = drawEntry.lines.reduce((s, l) => s + l.credit, 0);
    expect(round2(d_ - c_)).toBe(0);
    expect(drawEntry.lines.find((l) => l.accountId === 'acc-drawing-2')!.credit).toBe(40);
    for (const e of closing) {
      const dd = e.lines.reduce((s, l) => s + l.debit, 0);
      const cc = e.lines.reduce((s, l) => s + l.credit, 0);
      expect(round2(dd - cc), e.title).toBe(0);
    }
  });
});

describe('aset tetap', () => {
  const asset = (p: Partial<FixedAsset>): FixedAsset => ({
    id: 'a' + ++seq,
    name: 'Laptop',
    accountId: 'acc-equipment',
    acquisitionDate: '2025-01-15',
    cost: 24_000_000,
    residualValue: 0,
    usefulLifeMonths: 48,
    method: 'straight_line',
    funding: 'wallet',
    paidFromAccountId: BANK,
    ref: 'AST/2025/01/0001',
    createdAt: seq,
    ...p,
  });

  it('saldo menurun ganda beralih ke garis lurus dan habis tepat di nilai sisa', () => {
    const a = asset({ method: 'declining_balance', residualValue: 2_000_000, usefulLifeMonths: 36 });
    const rows = depreciationSchedule(a);
    expect(rows).toHaveLength(36);
    expect(rows[rows.length - 1].book).toBe(2_000_000);
    expect(round2(rows.reduce((s, r) => s + r.amount, 0))).toBe(22_000_000);
    for (let i = 1; i < rows.length; i++) expect(rows[i].amount).toBeLessThanOrEqual(rows[i - 1].amount + 0.01);
    // tanpa lonjakan: bulan terakhir tidak lebih besar dari bulan sebelumnya
    expect(rows[35].amount).toBeLessThanOrEqual(rows[34].amount + 0.01);
  });

  it('nomor bukti penyusutan unik antar-aset', () => {
    const d = base();
    d.transactions.push(tx({ type: 'opening', date: '2024-01-01', amount: 100_000_000, accountId: BANK }));
    d.assets.push(asset({ ref: 'AST/2025/01/0001' }), asset({ ref: 'AST/2025/03/0001', acquisitionDate: '2025-03-02' }));
    const refs = buildJournal(d).filter((e) => e.source === 'depreciation' && e.date.startsWith('2025-06')).map((e) => e.ref);
    expect(refs).toHaveLength(2);
    expect(new Set(refs).size).toBe(2);
  });

  it('pelepasan mencatat laba/rugi dan tetap seimbang; pelepasan sebelum perolehan diabaikan', () => {
    const d = base();
    d.transactions.push(tx({ type: 'opening', date: '2024-01-01', amount: 100_000_000, accountId: BANK }));
    d.assets.push(asset({ disposal: { date: '2025-07-10', proceeds: 20_000_000, accountId: BANK } }));
    d.assets.push(asset({ acquisitionDate: '2025-05-01', disposal: { date: '2025-04-01', proceeds: 1, accountId: BANK } }));
    const js = buildJournal(d);
    const dsp = js.filter((e) => e.source === 'disposal');
    expect(dsp).toHaveLength(1);
    // penyusutan akhir Feb–Jun = 5 × 500 rb → nilai buku 21,5 jt, dijual 20 jt → rugi 1,5 jt
    expect(dsp[0].lines.find((l) => l.accountId === SYS.lossDisposal)?.debit).toBe(1_500_000);
    expect(checkIntegrity(d).some((i) => i.code === 'asset-disposal')).toBe(true);
    allChecksPass(d, '2025-01-01', '2025-12-31');
  });
});

describe('arus kas: metode langsung = tidak langsung pada skenario campuran', () => {
  it('kartu kredit, jual kredit, pinjaman, hapus buku, transfer berbiaya, jurnal manual', () => {
    const d = base();
    d.transactions.push(
      tx({ type: 'opening', date: '2026-01-01', amount: 10_000_000, accountId: BANK }),
      tx({ type: 'opening', date: '2026-01-01', amount: 500_000, accountId: CC }),
      tx({ type: 'expense', date: '2026-01-03', amount: 250_000, accountId: CC, categoryId: 'acc-food' }),
      tx({ type: 'transfer', date: '2026-01-10', amount: 600_000, fee: 6_500, accountId: BANK, toAccountId: CC }),
      tx({ type: 'receivable_new', date: '2026-01-11', amount: 3_000_000, counter: 'category', categoryId: 'acc-freelance', contact: 'A' }),
      tx({ type: 'payable_new', date: '2026-01-12', amount: 5_000_000, counter: 'wallet', accountId: BANK, contact: 'B' }),
      tx({ type: 'receivable_new', date: '2026-01-13', amount: 1_000_000, counter: 'wallet', accountId: BANK, contact: 'C' }),
    );
    const rc = d.transactions[4];
    const loan = d.transactions[5];
    const lent = d.transactions[6];
    d.transactions.push(
      tx({ type: 'receivable_collect', date: '2026-02-01', amount: 2_000_000, interest: 0, accountId: BANK, parentId: rc.id }),
      tx({ type: 'receivable_writeoff', date: '2026-02-02', amount: 1_000_000, parentId: rc.id }),
      tx({ type: 'payable_pay', date: '2026-02-03', amount: 1_000_000, interest: 50_000, accountId: BANK, parentId: loan.id }),
      tx({ type: 'receivable_collect', date: '2026-02-04', amount: 400_000, interest: 10_000, accountId: BANK, parentId: lent.id }),
      tx({ type: 'receivable_writeoff', date: '2026-02-05', amount: 600_000, parentId: lent.id }),
      tx({ type: 'journal', date: '2026-02-06', lines: [{ accountId: 'acc-prepaid', debit: 1_200_000, credit: 0 }, { accountId: BANK, debit: 0, credit: 1_200_000 }] }),
      tx({ type: 'journal', date: '2026-02-28', adjusting: true, lines: [{ accountId: 'acc-insurance', debit: 100_000, credit: 0 }, { accountId: 'acc-prepaid', debit: 0, credit: 100_000 }] }),
      tx({ type: 'journal', date: '2026-02-10', lines: [{ accountId: 'acc-vehicle', debit: 8_000_000, credit: 0 }, { accountId: SYS.capital, debit: 0, credit: 8_000_000 }] }),
    );
    expect(checkIntegrity(d).filter((i) => i.level === 'error')).toEqual([]);
    for (const [f, t] of [['2026-01-01', '2026-01-31'], ['2026-02-01', '2026-02-28'], ['2026-01-01', '2026-03-31'], ['2026-01-15', '2026-02-15']]) allChecksPass(d, f, t);
  });
});

describe('rasio', () => {
  it('ROA/ROE disetahunkan untuk periode satu bulan', () => {
    const d = base();
    d.transactions.push(
      tx({ type: 'opening', date: '2026-01-01', amount: 12_000_000, accountId: BANK }),
      tx({ type: 'income', date: '2026-03-05', amount: 1_000_000, accountId: BANK, categoryId: 'acc-salary' }),
    );
    const r = ratios(getBooks(d), { from: '2026-03-01', to: '2026-03-31', label: '' });
    const roa = r.find((x) => x.name.includes('ROA'))!.value!;
    expect(roa).toBeGreaterThan(0.8); // ≈ 1 jt × 12 ÷ 13 jt
  });
});

describe('normalizeData', () => {
  it('membersihkan data impor yang rusak tanpa melempar galat', () => {
    const raw = {
      version: 1,
      profile: { name: 'A', fiscalYearStartMonth: 99 },
      accounts: [{ id: 'acc-x', name: '', code: '', subtype: 'aneh', type: 'expense' }, null, { id: 'acc-x', name: 'dup' }],
      transactions: [
        { id: 't1', type: 'expense', date: '2026-01-01', amount: 'abc', accountId: SYS.cash, categoryId: 'acc-x' },
        { id: 't2', type: 'bukan-jenis', date: '2026-01-01', amount: 1 },
        { id: 't3', type: 'income', date: 'kemarin', amount: 1 },
      ],
      budgets: [{ categoryId: 'acc-food', amount: 100 }, { categoryId: 'acc-food', amount: 200 }],
      assets: 'rusak',
    } as unknown as AppData;
    const d = normalizeData(raw);
    expect(d.profile.fiscalYearStartMonth).toBe(1);
    expect(d.transactions.map((t) => t.id)).toEqual(['t1']);
    expect(d.transactions[0].amount).toBe(0);
    expect(d.transactions[0].ref).toMatch(/^BKK\/2026\/01\//);
    expect(d.budgets).toHaveLength(1);
    expect(d.budgets[0].amount).toBe(200);
    expect(d.assets).toEqual([]);
    const x = d.accounts.find((a) => a.id === 'acc-x')!;
    expect(x.subtype).toBe('other_expense');
    expect(x.code).not.toBe('');
    expect(d.accounts.find((a) => a.id === SYS.otherIncome)?.system).toBe(true);
    expect(() => getBooks(d)).not.toThrow();
  });
});

describe('updateWallet', () => {
  beforeEach(() => useData.setState({ data: base(), past: [], future: [], lastId: null }));

  it('mengubah akun + saldo awal dalam satu langkah riwayat', () => {
    updateWallet(BANK, { name: 'Bank Baru' }, { amount: 1_500_000, date: '2026-01-01' });
    const s = useData.getState();
    expect(s.past).toHaveLength(1);
    expect(s.data.accounts.find((a) => a.id === BANK)!.name).toBe('Bank Baru');
    expect(s.data.transactions.find((t) => t.type === 'opening' && t.accountId === BANK)!.amount).toBe(1_500_000);
    useData.getState().undo();
    expect(useData.getState().data.transactions).toHaveLength(0);
    expect(useData.getState().data.accounts.find((a) => a.id === BANK)!.name).toBe(BANK);
  });
});
