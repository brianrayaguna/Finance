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
      onContextMenu={(e) => onContext?.(e, tx)}
      onMouseDown={() => onFocusRow?.(tx.id)}
    >
      {selectable && (
        <span className="tx-check row-front">
          <Checkbox checked={!!selected} onChange={(_, e) => onToggle?.(tx.id, e)} label="Pilih transaksi" />
        </span>
      )}
      <IconTile icon={v.icon} color={v.color} />
      <div className="tx-main">
        <div className={onOpen ? 'tx-title' : 'tx-title truncate'}>
          {onOpen ? (
            <button
              type="button"
              className="stretch-trigger truncate"
              data-tx-open={tx.id}
              aria-label={`${v.title}, ${prefix}${formatMoney(v.amount)}, ${formatDate(tx.date, 'long')}`}
              onClick={() => onOpen(tx)}
              onFocus={() => onFocusRow?.(tx.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.stopPropagation();
              }}
            >
              {v.title}
            </button>
          ) : (
            v.title
          )}
        </div>
        <div className="tx-sub truncate" title={tx.note ? `Catatan: ${tx.note}` : undefined}>
          {v.subtitle}
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
