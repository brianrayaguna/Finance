import { useMemo } from 'react';
import { SUBTYPE_META, TYPE_LABEL, WALLET_SUBTYPES, sortAccounts } from '../../accounting/coa';
import { walletBalances, debtInfos } from '../../accounting/reports';
import type { Account, AccountType } from '../../accounting/types';
import { useBooks, useToday } from '../../hooks/useApp';
import { useData } from '../../store/data';
import { formatMoney, formatDate } from '../../lib/format';
import type { SelectOption } from '../ui/Select';

export function useWalletOptions(includeArchived = false): SelectOption[] {
  const b = useBooks();
  const today = useToday();
  return useMemo(() => {
    const bals = new Map(walletBalances(b, today).map((w) => [w.account.id, w.balance]));
    return b.accounts
      .filter((a) => WALLET_SUBTYPES.includes(a.subtype) && (includeArchived || !a.archived))
      .sort((x, y) => WALLET_SUBTYPES.indexOf(x.subtype) - WALLET_SUBTYPES.indexOf(y.subtype) || x.code.localeCompare(y.code))
      .map((a) => {
        const v = bals.get(a.id) ?? 0;
        return {
          value: a.id,
          label: a.name,
          icon: a.icon,
          color: a.color,
          group: SUBTYPE_META[a.subtype].label,
          sub: formatMoney(a.subtype === 'credit_card' ? -v : v, { compact: Math.abs(v) >= 1e9 }),
        };
      });
  }, [b, today, includeArchived]);
}

export function useCategoryOptions(type: 'revenue' | 'expense'): SelectOption[] {
  const accounts = useData((s) => s.data.accounts);
  return useMemo(
    () =>
      sortAccounts(accounts)
        .filter((a) => a.type === type && !a.archived)
        .map((a) => ({
          value: a.id,
          label: a.name,
          icon: a.icon,
          color: a.color,
          group: SUBTYPE_META[a.subtype].label,
          keywords: a.code,
        })),
    [accounts, type],
  );
}

export function useAccountOptions(filter?: (a: Account) => boolean, keepIds?: string[]): SelectOption[] {
  const accounts = useData((s) => s.data.accounts);
  const keep = (keepIds ?? []).join('|');
  return useMemo(() => {
    const order: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];
    const kept = new Set(keep ? keep.split('|') : []);
    return sortAccounts(accounts)
      // akun arsip tetap ditampilkan bila sudah dipakai jurnal yang sedang diubah
      .filter((a) => (!a.archived || kept.has(a.id)) && (!filter || filter(a)))
      .sort((x, y) => order.indexOf(x.type) - order.indexOf(y.type) || x.code.localeCompare(y.code, 'en', { numeric: true }))
      .map((a) => ({
        value: a.id,
        label: a.name,
        icon: a.icon,
        color: a.color,
        group: TYPE_LABEL[a.type],
        sub: a.code,
        keywords: `${a.code} ${SUBTYPE_META[a.subtype].label}`,
      }));
  }, [accounts, filter, keep]);
}

export function useOpenDebtOptions(kind: 'payable' | 'receivable', includeId?: string): SelectOption[] {
  const data = useData((s) => s.data);
  return useMemo(
    () =>
      debtInfos(data, '9999-12-31')
        .filter((d) => d.kind === kind && (d.remaining > 0.005 || d.tx.id === includeId))
        .map((d) => ({
          value: d.tx.id,
          label: d.tx.contact || '—',
          description: `${d.tx.description || (kind === 'payable' ? 'Hutang' : 'Piutang')} · ${formatDate(d.tx.date)}`,
          sub: formatMoney(d.remaining),
          icon: kind === 'payable' ? 'handshake' : 'hand-coins',
          color: d.status === 'overdue' ? 'var(--neg)' : kind === 'payable' ? 'var(--tone-payable)' : 'var(--tone-receivable)',
          keywords: `${d.tx.description} ${d.tx.ref}`,
        })),
    [data, kind, includeId],
  );
}

export function useContacts(): string[] {
  const txs = useData((s) => s.data.transactions);
  return useMemo(() => {
    const m = new Map<string, number>();
    for (const t of txs) if (t.contact) m.set(t.contact, (m.get(t.contact) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [txs]);
}
