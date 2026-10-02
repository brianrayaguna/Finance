/*
 * Wawasan otomatis untuk dasbor: kalimat singkat yang menyoroti perubahan penting
 * (kategori naik/turun, anggaran berisiko, tabungan, tagihan, saldo negatif, dana darurat).
 * Perbandingan bulan berjalan memakai rentang tanggal yang sama pada bulan lalu agar adil.
 */
import { addMonths, endOfMonth, formatMoney, formatPercent, startOfMonth } from '../lib/format';
import { activity, budgetVsActual, debtInfos, ratios, walletBalances, type Books } from './reports';

export type InsightTone = 'neg' | 'warn' | 'pos' | 'info';

export interface Insight {
  id: string;
  tone: InsightTone;
  text: string;
  to?: string;
}

const RANK: Record<InsightTone, number> = { neg: 0, warn: 1, pos: 2, info: 3 };

export function buildInsights(b: Books, month: string, today: string, limit = 5): Insight[] {
  const out: Insight[] = [];
  const from = `${month}-01`;
  const monthEnd = endOfMonth(from);
  const isCur = month === today.slice(0, 7);
  if (from > today) return out;
  const to = isCur ? today : monthEnd;
  const pFrom = startOfMonth(addMonths(from, -1));
  const pTo = isCur ? addMonths(to, -1) : endOfMonth(pFrom);
  const cur = activity(b, from, to);
  const prev = activity(b, pFrom, pTo);
  const cmp = isCur ? 'dibanding periode yang sama bulan lalu' : 'dibanding bulan sebelumnya';

  // 1. Kategori beban yang berubah paling besar
  type Change = { name: string; id: string; diff: number; pct: number };
  let up: Change | null = null;
  let down: Change | null = null;
  let income = 0;
  let expense = 0;
  for (const a of b.accounts) {
    const x = cur.get(a.id);
    const y = prev.get(a.id);
    if (a.type === 'revenue') income += x ? x.c - x.d : 0;
    if (a.type !== 'expense') continue;
    const c = x ? x.d - x.c : 0;
    const p = y ? y.d - y.c : 0;
    expense += c;
    if (p <= 0) continue;
    const diff = c - p;
    const pct = diff / p;
    if (diff >= 100_000 && pct >= 0.2 && (!up || diff > up.diff)) up = { name: a.name, id: a.id, diff, pct };
    if (diff <= -100_000 && pct <= -0.2 && (!down || diff < down.diff)) down = { name: a.name, id: a.id, diff, pct };
  }
  if (up)
    out.push({ id: 'cat-up', tone: 'warn', text: `${up.name} naik ${formatPercent(up.pct, 0)} (+${formatMoney(up.diff)}) ${cmp}.`, to: `/transaksi?kategori=${up.id}&bulan=${month}` });
  if (down)
    out.push({ id: 'cat-down', tone: 'pos', text: `${down.name} turun ${formatPercent(-down.pct, 0)} — hemat ${formatMoney(-down.diff)} ${cmp}.`, to: `/transaksi?kategori=${down.id}&bulan=${month}` });

  // 2. Anggaran
  const lines = budgetVsActual(b, from, monthEnd);
  const daysInMonth = Number(monthEnd.slice(8));
  const pace = isCur ? Number(today.slice(8)) / daysInMonth : 1;
  const over = lines.filter((l) => l.used > 1);
  if (over.length)
    out.push({
      id: 'budget-over',
      tone: 'neg',
      text:
        over.length === 1
          ? `Anggaran ${over[0].account.name} terlampaui ${formatMoney(-over[0].variance)}.`
          : `${over.length} anggaran terlampaui: ${over.slice(0, 3).map((l) => l.account.name).join(', ')}${over.length > 3 ? ', …' : ''}.`,
      to: '/anggaran',
    });
  if (isCur) {
    const risky = lines.filter((l) => l.used <= 1 && l.used >= 0.5 && l.used > pace + 0.15).sort((x, y) => y.used - x.used)[0];
    if (risky)
      out.push({
        id: 'budget-pace',
        tone: 'warn',
        text: `Anggaran ${risky.account.name} sudah terpakai ${formatPercent(risky.used, 0)}, padahal bulan baru berjalan ${formatPercent(pace, 0)}.`,
        to: '/anggaran',
      });
  }

  // 3. Tabungan
  if (income > 0) {
    const rate = (income - expense) / income;
    if (rate < 0) out.push({ id: 'saving', tone: 'neg', text: `Beban melebihi pendapatan sebesar ${formatMoney(expense - income)} pada ${isCur ? 'bulan ini' : 'bulan tersebut'}.`, to: '/laporan?r=laba-rugi' });
    else if (rate >= 0.2) out.push({ id: 'saving', tone: 'pos', text: `Tingkat tabungan ${formatPercent(rate, 0)} — di atas sasaran 20%.`, to: '/laporan?r=rasio' });
  }

  if (isCur) {
    // 4. Tagihan hutang yang segera jatuh tempo / lewat
    const debts = debtInfos(b.data, today).filter((d) => d.kind === 'payable' && d.remaining > 0.005);
    const overdue = debts.filter((d) => d.status === 'overdue');
    const soon = debts.filter((d) => d.status === 'due_soon');
    if (overdue.length)
      out.push({ id: 'due-over', tone: 'neg', text: `${overdue.length} hutang lewat jatuh tempo, total ${formatMoney(overdue.reduce((s, d) => s + d.remaining, 0))}.`, to: '/hutang-piutang' });
    if (soon.length)
      out.push({ id: 'due-soon', tone: 'warn', text: `${soon.length} hutang jatuh tempo dalam 7 hari, total ${formatMoney(soon.reduce((s, d) => s + d.remaining, 0))}.`, to: '/hutang-piutang' });

    // 5. Dompet bersaldo negatif (biasanya saldo awal belum diisi)
    const negative = walletBalances(b, today).filter((w) => ['cash', 'bank', 'ewallet'].includes(w.account.subtype) && !w.account.archived && w.balance < -0.005);
    for (const w of negative.slice(0, 2))
      out.push({ id: 'neg-' + w.account.id, tone: 'neg', text: `Saldo ${w.account.name} negatif (${formatMoney(w.balance)}) — isi saldo awal atau catat pemasukannya.`, to: '/dompet' });

    // 6. Dana darurat
    const em = ratios(b, { from: startOfMonth(addMonths(today, -2)), to: today, label: '' }).find((r) => r.name === 'Cakupan Dana Darurat');
    if (em && em.value !== null && em.value >= 0 && em.value < 3)
      out.push({ id: 'emergency', tone: 'warn', text: `Dana darurat hanya cukup ${em.value.toFixed(1).replace('.', ',')} bulan beban tunai — sasaran minimal 3–6 bulan.`, to: '/laporan?r=rasio' });
  }

  return out.sort((x, y) => RANK[x.tone] - RANK[y.tone]).slice(0, limit);
}
