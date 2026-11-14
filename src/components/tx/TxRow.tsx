import { memo } from 'react';
import type { Account, Transaction } from '../../accounting/types';
import { formatMoney, formatDate } from '../../lib/format';
import { IconTile, Checkbox } from '../ui/primitives';
import { txView } from './txDisplay';

export const TxRow = memo(function TxRow({
  tx,
  acc,
  parent,
  showDate,
  selected,
  focused,
  selectable,
  onToggle,
  onOpen,
  onContext,
  onFocusRow,
}: {
  tx: Transaction;
  acc: Map<string, Account>;
  parent?: Transaction;
  showDate?: boolean;
  selected?: boolean;
  focused?: boolean;
  selectable?: boolean;
  onToggle?: (id: string, e: React.MouseEvent) => void;
  onOpen?: (t: Transaction) => void;
  onContext?: (e: React.MouseEvent, t: Transaction) => void;
  onFocusRow?: (id: string) => void;
}) {
  const v = txView(tx, acc, parent);
  const cls = v.sign > 0 ? 'pos' : '';
  const prefix = v.sign > 0 ? '+' : v.sign < 0 ? '−' : '';
  return (
    <div
      className={`tx-row${selected ? ' selected' : ''}${focused ? ' focused' : ''}`}
      data-id={tx.id}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={`${v.title}, ${prefix}${formatMoney(v.amount)}, ${formatDate(tx.date, 'long')}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget && onOpen) {
          e.preventDefault();
          e.stopPropagation();
          onOpen(tx);
        }
      }}
      onFocus={(e) => e.target === e.currentTarget && onFocusRow?.(tx.id)}
      onClick={() => onOpen?.(tx)}
      onContextMenu={(e) => onContext?.(e, tx)}
      onMouseDown={() => onFocusRow?.(tx.id)}
    >
      {selectable && (
        <span className="tx-check" onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={!!selected} onChange={(_, e) => onToggle?.(tx.id, e)} label="Pilih transaksi" />
        </span>
      )}
      <IconTile icon={v.icon} color={v.color} />
      <div className="tx-main">
        <div className="tx-title truncate">{v.title}</div>
        <div className="tx-sub truncate">
          {v.subtitle}
          {tx.note && <span className="tx-note"> · {tx.note}</span>}
        </div>
      </div>
      <div className="tx-ref">{tx.ref}</div>
      <div className="tx-amt">
        <div className={`num money-val ${cls}`}>
          {prefix}
          {formatMoney(v.amount)}
        </div>
        <div className="tx-time">{showDate ? formatDate(tx.date) : tx.time || ''}</div>
      </div>
    </div>
  );
});
