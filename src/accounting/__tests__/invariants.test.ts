import { describe, expect, it } from 'vitest';
import { buildSampleData } from '../../store/sample';
import { emptyData } from '../../store/data';
import { buildJournal, entryTotals } from '../engine';
import {
  balanceSheet,
  cashFlowStatement,
  equityStatement,
  getBooks,
  incomeStatement,
  trialBalance,
  worksheet,
} from '../reports';
import { makeDates, makePeriods } from '../periods';
import { checkIntegrity } from '../integrity';
import { addMonths, endOfMonth, monthsBetween, startOfMonth, todayISO } from '../../lib/format';

const data = buildSampleData(emptyData().profile);
const books = getBooks(data);
const today = todayISO();

function periodsToTest() {
  const out: { from: string; to: string }[] = [];
  const start = startOfMonth(addMonths(today, -10));
  for (const m of monthsBetween(start, today)) out.push({ from: m + '-01', to: endOfMonth(m + '-01') });
  out.push({ from: today.slice(0, 4) + '-01-01', to: today });
  out.push({ from: start, to: today });
  out.push({ from: addMonths(today, -2).slice(0, 8) + '10', to: addMonths(today, -1).slice(0, 8) + '20' });
  return out;
}

describe('invarian buku pada data contoh', () => {
  it('tidak ada masalah integritas', () => {
    expect(checkIntegrity(data)).toEqual([]);
  });

  it('setiap jurnal seimbang', () => {
    for (const e of buildJournal(data)) expect(entryTotals(e).balanced, e.ref).toBe(true);
  });

  for (const p of periodsToTest()) {
    for (const compare of [false, true]) {
      it(`laporan seimbang ${p.from}..${p.to}${compare ? ' (banding)' : ''}`, () => {
        const periods = makePeriods(p.from, p.to, compare);
        const reports = [
          incomeStatement(books, periods, 'X'),
          balanceSheet(books, makeDates(p.to, compare, p.from), 'X'),
          cashFlowStatement(books, periods, 'X'),
          equityStatement(books, periods[0], 'X'),
          trialBalance(books, p.to, 'X'),
          worksheet(books, periods[0], 'X'),
        ];
        for (const r of reports) for (const c of r.checks ?? []) expect(c.ok, `${r.title}: ${c.label} (selisih ${c.diff})`).toBe(true);
      });
    }
  }
});
