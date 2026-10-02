import type { TxTemplate } from '../../accounting/types';
import { addTransaction, getData } from '../../store/data';
import { notify } from '../../store/history';
import { useUI } from '../../store/ui';
import { formatMoney, nowTime, todayISO } from '../../lib/format';

/** Apakah favorit cukup lengkap untuk dicatat langsung tanpa membuka formulir. */
export function templateReady(t: TxTemplate): boolean {
  const acc = new Map(getData().accounts.map((a) => [a.id, a]));
  const ok = (id?: string) => !!id && !!acc.get(id) && !acc.get(id)!.archived;
  if (!(t.amount && t.amount > 0) || !ok(t.accountId)) return false;
  if (t.type === 'transfer') return ok(t.toAccountId) && t.toAccountId !== t.accountId;
  return ok(t.categoryId);
}

/**
 * Menjalankan transaksi favorit: dicatat langsung hari ini (dengan tombol Urungkan)
 * bila lengkap, atau membuka formulir yang sudah terisi bila nominal/akun belum ada.
 */
export function runTemplate(t: TxTemplate) {
  const base = {
    type: t.type,
    accountId: t.accountId,
    toAccountId: t.type === 'transfer' ? t.toAccountId : undefined,
    categoryId: t.type === 'transfer' ? undefined : t.categoryId,
    description: t.description ?? t.name,
  };
  if (!templateReady(t)) {
    useUI.getState().openTx({ ...base, amount: t.amount });
    return;
  }
  const { tx, historyId } = addTransaction({ ...base, date: todayISO(), time: nowTime(), amount: t.amount! }, `Favorit: ${t.name}`);
  notify(`${t.name} ${formatMoney(t.amount!)} dicatat`, historyId, { detail: tx.ref });
}
