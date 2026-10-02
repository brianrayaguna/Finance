/*
 * Target tabungan: kemajuan dihitung dari saldo gabungan dompet yang ditautkan (tetap double-entry —
 * tidak ada "setoran" terpisah; menabung = memindahkan uang ke dompet tersebut).
 */
import { addDays, addMonths, daysBetween, isZero, round2 } from '../lib/format';
import { balancesAt, bal, type Books } from './reports';
import type { Goal } from './types';

export type GoalStatus = 'done' | 'on_track' | 'behind' | 'overdue' | 'no_date' | 'unlinked';

export interface GoalProgress {
  goal: Goal;
  current: number;
  pct: number;
  remaining: number;
  /** Rata-rata kenaikan saldo per bulan dalam 3 bulan terakhir */
  pace: number;
  /** Setoran per bulan yang dibutuhkan agar tepat waktu */
  perMonth: number | null;
  monthsLeft: number | null;
  /** Perkiraan tanggal tercapai dengan laju saat ini */
  projected: string | null;
  status: GoalStatus;
}

const linkedBalance = (b: Books, g: Goal, to: string) => {
  const m = balancesAt(b, to);
  let v = 0;
  for (const id of g.accountIds) {
    const a = b.acc.get(id);
    if (a) v += bal(a, m);
  }
  return round2(v);
};

const MAX_PROJECTION_MONTHS = 1200;

export function goalProgress(b: Books, g: Goal, asOf: string): GoalProgress {
  const current = linkedBalance(b, g, asOf);
  const remaining = round2(Math.max(0, g.target - current));
  const pct = g.target > 0 ? Math.max(0, Math.min(1, current / g.target)) : 0;
  const pace = Math.round((current - linkedBalance(b, g, addMonths(asOf, -3))) / 3);
  const daysLeft = g.targetDate ? daysBetween(asOf, g.targetDate) : null;
  const monthsLeft = daysLeft === null ? null : Math.max(0, daysLeft / (365 / 12));
  // dibulatkan ke atas ke rupiah penuh agar setoran yang disarankan pasti cukup
  const perMonth = monthsLeft === null ? null : remaining <= 0 ? 0 : Math.ceil(remaining / Math.max(1, monthsLeft));
  // bulan yang dibutuhkan dengan laju saat ini; di atas 100 tahun dianggap tidak akan tercapai
  const monthsNeeded = remaining <= 0 ? 0 : pace > 0 ? remaining / pace : Infinity;
  const projected = monthsNeeded <= MAX_PROJECTION_MONTHS ? addDays(asOf, Math.ceil(monthsNeeded * (365 / 12))) : null;

  let status: GoalStatus;
  if (!g.accountIds.length) status = 'unlinked';
  else if (remaining <= 0 || isZero(remaining)) status = 'done';
  else if (!g.targetDate) status = 'no_date';
  else if (daysLeft !== null && daysLeft < 0) status = 'overdue';
  else status = monthsLeft !== null && monthsNeeded <= monthsLeft ? 'on_track' : 'behind';

  return { goal: g, current, pct, remaining, pace, perMonth, monthsLeft, projected, status };
}
