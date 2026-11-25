import { useEffect, useMemo } from 'react';
import { budgetVsActual, debtInfos, getBooks } from '../accounting/reports';
import { checkIntegrity } from '../accounting/integrity';
import type { AppData } from '../accounting/types';
import { useData } from '../store/data';
import { pruneReadReminders, usePrefs } from '../store/ui';
import { daysBetween, endOfMonth, formatMoney, startOfMonth } from '../lib/format';
import { useToday } from './useApp';

export interface Reminder {
  id: string;
  tone: 'neg' | 'warn';
  icon: string;
  title: string;
  detail: string;
  /** Keterangan waktu (mis. "lewat 3 hari") — ditonjolkan sesuai tingkat */
  when?: string;
  to: string;
}

export interface Reminders {
  items: Reminder[];
  /** Item yang belum diklik — untuk strip Ringkasan */
  unreadItems: Reminder[];
  /** Hutang/piutang yang lewat atau ≤ 7 hari jatuh tempo */
  dueCount: number;
  /** Anggaran bulan ini yang terlampaui */
  budgetOver: number;
}

const EMPTY: Omit<Reminders, 'unreadItems'> = { items: [], dueCount: 0, budgetOver: 0 };

let last: { data: AppData; today: string; value: Omit<Reminders, 'unreadItems'> } | null = null;

/**
 * Pengingat yang membutuhkan tindakan: hutang/piutang lewat atau ≤ 7 hari jatuh tempo,
 * anggaran bulan ini yang terlampaui, dan transaksi yang tidak masuk buku.
 * Dipakai lonceng di bilah atas dan lencana di sidebar (dihitung sekali per perubahan data).
 */
export function useReminders(): Reminders {
  const data = useData((s) => s.data);
  const today = useToday();
  const readReminders = usePrefs((s) => s.readReminders);
  const readIds = Array.isArray(readReminders) ? readReminders : [];

  const base = useMemo(() => {
    if (last && last.data === data && last.today === today) return last.value;
    try {
      const value = computeReminders(data, today);
      last = { data, today, value };
      return value;
    } catch (err) {
      console.error('Gagal menghitung pengingat:', err);
      last = { data, today, value: EMPTY };
      return EMPTY;
    }
  }, [data, today]);

  const unreadItems = useMemo(() => {
    if (readIds.length === 0) return base.items;
    const read = new Set(readIds);
    return base.items.filter((r) => !read.has(r.id));
  }, [base.items, readIds]);

  useEffect(() => {
    pruneReadReminders(new Set(base.items.map((r) => r.id)));
  }, [base.items]);

  return { ...base, unreadItems };
}

export function computeReminders(data: AppData, today: string): Omit<Reminders, 'unreadItems'> {
  const items: Reminder[] = [];
  const debts = debtInfos(data, today).filter((d) => d.remaining > 0.005 && (d.status === 'overdue' || d.status === 'due_soon'));
  for (const d of debts) {
    const days = d.tx.dueDate ? daysBetween(today, d.tx.dueDate) : 0;
    const when = days < 0 ? `lewat ${-days} hari` : days === 0 ? 'jatuh tempo hari ini' : `${days} hari lagi`;
    items.push({
      id: 'debt-' + d.tx.id,
      tone: d.status === 'overdue' ? 'neg' : 'warn',
      icon: d.kind === 'payable' ? 'handshake' : 'hand-coins',
      title: d.tx.contact ? `${d.kind === 'payable' ? 'Bayar hutang ke' : 'Tagih piutang dari'} ${d.tx.contact}` : d.kind === 'payable' ? 'Bayar hutang' : 'Tagih piutang',
      detail: formatMoney(d.remaining),
      when,
      to: '/hutang-piutang',
    });
  }
  const over = budgetVsActual(getBooks(data), startOfMonth(today), endOfMonth(today), today).filter(
    (l) => (l.kind === 'expense' || l.activeInPeriod) && l.used > 1,
  );
  for (const l of over)
    items.push({
      id: 'budget-' + l.key,
      tone: 'neg',
      icon: l.icon,
      title: `Anggaran ${l.label} terlampaui`,
      detail: `Lebih ${formatMoney(-l.variance)} dari batas ${formatMoney(l.budget)}`,
      to: '/anggaran',
    });
  const errors = checkIntegrity(data).filter((i) => i.level === 'error');
  if (errors.length)
    items.push({
      id: 'integrity',
      tone: 'neg',
      icon: 'scale',
      title: `${errors.length} masalah integritas buku`,
      detail: 'Ada transaksi yang tidak masuk buku besar',
      to: '/pengaturan/data#integritas',
    });
  return { items, dueCount: debts.length, budgetOver: over.length };
}
