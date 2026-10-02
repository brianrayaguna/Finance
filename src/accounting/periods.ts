import { addDays, addMonths, daysBetween, endOfMonth, formatDate, formatMonth, monthsBetween, startOfMonth, periodLabel } from '../lib/format';
import type { Period } from './reports';

/** Periode pembanding dengan panjang yang sama tepat sebelum periode aktif. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  // periode panjang / tahun berjalan: bandingkan dengan periode yang sama tahun lalu
  if (daysBetween(from, to) > 95 || (from.slice(5) === '01-01' && to.slice(5, 7) !== '01')) {
    const f = addMonths(from, -12);
    const t = to === endOfMonth(to) ? endOfMonth(addMonths(to, -12)) : addMonths(to, -12);
    return { from: f, to: t };
  }
  const monthAligned = from === startOfMonth(from) && to === endOfMonth(to);
  if (monthAligned) {
    const k = monthsBetween(from, to).length;
    const f = addMonths(from, -k);
    return { from: f, to: endOfMonth(addMonths(f, k - 1)) };
  }
  const len = daysBetween(from, to);
  const t = addDays(from, -1);
  return { from: addDays(t, -len), to: t };
}

export function shortLabel(from: string, to: string): string {
  if (from === startOfMonth(from) && to === endOfMonth(from) && from.slice(0, 7) === to.slice(0, 7)) return formatMonth(from.slice(0, 7), true);
  if (from.endsWith('-01-01') && to.endsWith('-12-31') && from.slice(0, 4) === to.slice(0, 4)) return from.slice(0, 4);
  if (from.slice(0, 4) === to.slice(0, 4) && from === startOfMonth(from) && to === endOfMonth(to))
    return `${formatMonth(from.slice(0, 7), true).split(' ')[0]}–${formatMonth(to.slice(0, 7), true)}`;
  return `${formatDate(from)} – ${formatDate(to)}`;
}

export function makePeriods(from: string, to: string, compare: boolean): Period[] {
  const cur: Period = { from, to, label: shortLabel(from, to) };
  if (!compare) return [{ ...cur, label: periodLabel(from, to) }];
  const p = previousPeriod(from, to);
  return [cur, { ...p, label: shortLabel(p.from, p.to) }];
}

export function makeDates(to: string, compare: boolean, from?: string): { to: string; label: string }[] {
  const cur = { to, label: formatDate(to) };
  if (!compare) return [{ ...cur, label: formatDate(to, 'long') }];
  const prevTo = from ? addDays(from, -1) : endOfMonth(addMonths(to, -1));
  return [cur, { to: prevTo, label: formatDate(prevTo) }];
}
