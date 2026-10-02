import type { Account, Transaction } from '../../accounting/types';
import { TX_META } from '../../accounting/engine';

export interface TxView {
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  amount: number;
  /** 1 = kas masuk, -1 = kas keluar, 0 = netral */
  sign: 1 | -1 | 0;
  kind: string;
}

export function txView(t: Transaction, acc: Map<string, Account>, parent?: Transaction): TxView {
  const a = (id?: string) => (id ? acc.get(id) : undefined);
  const cat = a(t.categoryId);
  const wal = a(t.accountId);
  const kind = TX_META[t.type].label;
  const amt = t.amount + (t.fee || 0) + (t.interest || 0);
  switch (t.type) {
    case 'income':
      return { title: t.description || cat?.name || kind, subtitle: [cat?.name, wal?.name].filter(Boolean).join(' · '), icon: cat?.icon ?? 'trending-up', color: cat?.color ?? '#4C8A58', amount: t.amount, sign: 1, kind };
    case 'expense':
      return { title: t.description || cat?.name || kind, subtitle: [cat?.name, wal?.name].filter(Boolean).join(' · '), icon: cat?.icon ?? 'receipt', color: cat?.color ?? 'var(--tone-payable)', amount: t.amount, sign: -1, kind };
    case 'transfer':
      return {
        title: t.description || 'Transfer',
        subtitle: `${wal?.name ?? '—'} → ${a(t.toAccountId)?.name ?? '—'}${t.fee ? ' · biaya admin' : ''}`,
        icon: 'repeat',
        color: 'var(--tone-transfer)',
        amount: amt,
        sign: 0,
        kind,
      };
    case 'payable_new':
      return {
        title: t.description || `Hutang kepada ${t.contact}`,
        subtitle: `Hutang · ${t.contact ?? ''}${t.counter === 'wallet' && wal ? ' · ' + wal.name : t.counter === 'category' && cat ? ' · ' + cat.name : t.counter === 'opening' ? ' · saldo awal' : ''}`,
        icon: 'handshake',
        color: 'var(--tone-payable)',
        amount: t.amount,
        sign: t.counter === 'wallet' ? 1 : 0,
        kind,
      };
    case 'payable_pay':
      return { title: t.description || `Bayar hutang ${parent?.contact ?? ''}`.trim(), subtitle: `Pembayaran hutang · ${wal?.name ?? ''}${t.interest ? ' · termasuk bunga' : ''}`, icon: 'handshake', color: 'var(--tone-payable)', amount: amt, sign: -1, kind };
    case 'receivable_new':
      return {
        title: t.description || `Piutang ${t.contact}`,
        subtitle: `Piutang · ${t.contact ?? ''}${t.counter === 'wallet' && wal ? ' · ' + wal.name : t.counter === 'category' && cat ? ' · ' + cat.name : t.counter === 'opening' ? ' · saldo awal' : ''}`,
        icon: 'hand-coins',
        color: 'var(--tone-receivable)',
        amount: t.amount,
        sign: t.counter === 'wallet' ? -1 : 0,
        kind,
      };
    case 'receivable_collect':
      return { title: t.description || `Terima piutang ${parent?.contact ?? ''}`.trim(), subtitle: `Penerimaan piutang · ${wal?.name ?? ''}`, icon: 'hand-coins', color: 'var(--tone-receivable)', amount: amt, sign: 1, kind };
    case 'receivable_writeoff':
      return { title: t.description || `Hapus buku piutang ${parent?.contact ?? ''}`.trim(), subtitle: 'Beban piutang tak tertagih', icon: 'receipt-text', color: 'var(--neg)', amount: t.amount, sign: 0, kind };
    case 'opening':
      return { title: `Saldo awal ${wal?.name ?? ''}`.trim(), subtitle: 'Ekuitas saldo awal', icon: wal?.icon ?? 'scale', color: wal?.color ?? '#8A6546', amount: t.amount, sign: 0, kind };
    case 'journal':
      return { title: t.description || 'Jurnal umum', subtitle: `${t.adjusting ? 'Jurnal penyesuaian' : 'Jurnal umum'} · ${t.lines?.length ?? 0} baris`, icon: 'pen', color: '#78736A', amount: t.amount, sign: 0, kind };
  }
}

/**
 * Pemasukan & pengeluaran (pos laba rugi) yang melekat pada satu transaksi.
 * Satu definisi dipakai bersama oleh daftar transaksi, kalender, dan ringkasan harian agar angkanya selalu sama:
 * biaya admin transfer dan bunga pinjaman ikut dihitung sebagai pengeluaran; bunga piutang sebagai pemasukan.
 */
export function txFlow(t: Transaction): { inc: number; exp: number } {
  switch (t.type) {
    case 'income':
      return { inc: t.amount, exp: 0 };
    case 'expense':
      return { inc: 0, exp: t.amount };
    case 'transfer':
      return { inc: 0, exp: t.fee || 0 };
    case 'payable_pay':
      return { inc: 0, exp: t.interest || 0 };
    case 'receivable_collect':
      return { inc: t.interest || 0, exp: 0 };
    default:
      return { inc: 0, exp: 0 };
  }
}

/** Perubahan saldo dompet bersih dari satu transaksi — untuk subtotal harian. Transfer antar-dompet netral kecuali biayanya. */
export function cashDelta(t: Transaction): number {
  switch (t.type) {
    case 'income':
      return t.amount;
    case 'expense':
      return -t.amount;
    case 'transfer':
      return -(t.fee || 0);
    case 'payable_new':
      return t.counter === 'wallet' ? t.amount : 0;
    case 'payable_pay':
      return -(t.amount + (t.interest || 0));
    case 'receivable_new':
      return t.counter === 'wallet' ? -t.amount : 0;
    case 'receivable_collect':
      return t.amount + (t.interest || 0);
    default:
      return 0;
  }
}
