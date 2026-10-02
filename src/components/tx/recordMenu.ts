import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, HandCoins, Handshake, NotebookPen, Star } from 'lucide-react';
import type { TxTemplate } from '../../accounting/types';
import type { UiMode } from '../../app/nav';
import type { TxModalState } from '../../store/ui';
import { formatMoney } from '../../lib/format';
import type { MenuItem } from '../ui/Popover';
import { runTemplate } from './templates';

/** Pilihan jenis transaksi + favorit sekali klik — dipakai tombol Catat di sidebar dan bilah atas. */
export function recordMenuItems(openTx: (d?: TxModalState['defaults']) => void, mode: UiMode, templates: TxTemplate[]): MenuItem[] {
  return [
    { heading: 'Catat' },
    { label: 'Pengeluaran', icon: ArrowUpRight, kbd: 'N', onSelect: () => openTx({ type: 'expense' }) },
    { label: 'Pemasukan', icon: ArrowDownLeft, onSelect: () => openTx({ type: 'income' }) },
    { label: 'Transfer antar akun', icon: ArrowLeftRight, onSelect: () => openTx({ type: 'transfer' }) },
    { label: 'Hutang baru', icon: Handshake, onSelect: () => openTx({ type: 'payable_new' }) },
    { label: 'Piutang baru', icon: HandCoins, onSelect: () => openTx({ type: 'receivable_new' }) },
    ...(mode === 'accountant' ? [{ label: 'Jurnal umum', icon: NotebookPen, onSelect: () => openTx({ type: 'journal' }) }] : []),
    ...(templates.length
      ? [
          { separator: true },
          { heading: 'Favorit — sekali klik' },
          ...templates.slice(0, 6).map((t) => ({
            label: t.name,
            icon: Star,
            hint: t.amount ? formatMoney(t.amount, { compact: true, symbol: false }) : undefined,
            onSelect: () => runTemplate(t),
          })),
        ]
      : []),
  ];
}
