import { describe, expect, it } from 'vitest';
import { buildSampleData } from '../../store/sample';
import { emptyData } from '../../store/data';
import { getBooks, monthlySeries, periodFlow } from '../reports';
import { endOfMonth, todayISO } from '../../lib/format';

const books = getBooks(buildSampleData(emptyData().profile));
const today = todayISO();
const thisMonth = today.slice(0, 7);

describe('deret bulanan & periodFlow', () => {
  it('menandai bulan berjalan sebagai belum lengkap, bulan lalu sebagai lengkap', () => {
    const s = monthlySeries(books, thisMonth, 3, today);
    const last = s[s.length - 1];
    expect(last.month).toBe(thisMonth);
    expect(last.partial).toBe(endOfMonth(thisMonth + '-01') > today);
    for (const m of s.slice(0, -1)) expect(m.partial).toBe(false);
  });

  it('tidak menandai bulan berjalan bila "hari ini" sudah melewati akhir bulan', () => {
    const s = monthlySeries(books, thisMonth, 1, endOfMonth(thisMonth + '-01'));
    expect(s[0].partial).toBe(false);
  });

  it('periodFlow sama dengan titik deret untuk satu bulan penuh', () => {
    const prev = monthlySeries(books, thisMonth, 2, today)[0];
    const f = periodFlow(books, prev.month + '-01', endOfMonth(prev.month + '-01'));
    expect(f).toEqual({ income: prev.income, expense: prev.expense, net: prev.net });
  });

  it('rentang sebagian tidak melebihi bulan penuhnya', () => {
    const prev = monthlySeries(books, thisMonth, 2, today)[0];
    const half = periodFlow(books, prev.month + '-01', prev.month + '-10');
    expect(half.expense).toBeLessThanOrEqual(prev.expense + 0.01);
  });
});
