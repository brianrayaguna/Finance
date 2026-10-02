import { useMemo } from 'react';
import { budgetVsActual, debtInfos, getBooks } from '../accounting/reports';
import { checkIntegrity } from '../accounting/integrity';
import type { AppData } from '../accounting/types';
import { useData } from '../store/data';
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
  /** Hutang/piutang yang lewat atau ≤ 7 hari jatuh tempo */
  dueCount: number;
  /** Anggaran bulan ini yang terlampaui */
  budgetOver: number;
}

let last: { data: AppData; today: string; value: Reminders } | null = null;

/**
 * Pengingat yang membutuhkan tindakan: hutang/piutang lewat atau ≤ 7 hari jatuh tempo,
 * anggaran bulan ini yang terlampaui, dan transaksi yang tidak masuk buku.
 * Dipakai lonceng di bilah atas dan lencana di sidebar (dihitung sekali per perubahan data).
 */
export function useReminders(): Reminders {
  const data = useData((s) => s.data);
  const today = useToday();
  return useMemo(() => {
    if (last && last.data === data && last.today === today) return last.value;
    const value = computeReminders(data, today);
    last = { data, today, value };
    return value;
  }, [data, today]);
}

export function computeReminders(data: AppData, today: string): Reminders {
  const items: Reminder[] = [];
  const debts = debtInfos(data, today).filter((d) => d.remaining > 0.005 && (d.status === 'overdue' || d.status === 'due_soon'));
  for (const d of debts) {
    const days = d.tx.dueDate ? daysBetween(today, d.tx.dueDate) : 0;
    const when = days < 0 ? `lewat ${-days} hari` : days === 0 ? 'jatuh tempo hari ini' : `${days} hari lagi`;
    items.push({
      id: 'debt-' + d.tx.id,
      tone: d.status === 'overdue' ? 'neg' : 'warn',
      icon: d.kind === 'payable' ? 'handshake' : 'hand-coins',
      title: `${d.kind === 'payable' ? 'Bayar hutang' : 'Tagih piutang'} · ${d.tx.contact || '—'}`,
      detail: formatMoney(d.remaining),
      when,
      to: '/hutang-piutang',
    });
  }
  const over = budgetVsActual(getBooks(data), startOfMonth(today), endOfMonth(today)).filter((l) => l.used > 1);
  for (const l of over)
    items.push({
      id: 'budget-' + l.account.id,
      tone: 'neg',
      icon: l.account.icon,
      title: `Anggaran ${l.account.name} terlampaui`,
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
      to: '/pengaturan#integritas',
    });
  return { items, dueCount: debts.length, budgetOver: over.length };
}
