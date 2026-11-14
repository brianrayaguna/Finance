import { memo } from 'react';
import type { Account, Transaction } from '../../accounting/types';
import { formatMoney, formatDate } from '../../lib/format';
import { usePrefs } from '../../store/ui';
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
  const hideAmounts = usePrefs((s) => s.hideAmounts);
  const v = txView(tx, acc, parent);
  const cls = v.sign > 0 ? 'pos' : '';
  const prefix = v.sign > 0 ? '+' : v.sign < 0 ? '−' : '';
  const label = hideAmounts
    ? `${v.title}, ${formatDate(tx.date, 'long')}`
    : `${v.title}, ${prefix}${formatMoney(v.amount)}, ${formatDate(tx.date, 'long')}`;
  const body = (
    <>
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
    </>
  );
  return (
    <div
      className={`tx-row${selected ? ' selected' : ''}${focused ? ' focused' : ''}`}
      data-id={tx.id}
      onContextMenu={(e) => onContext?.(e, tx)}
      onMouseDown={() => onFocusRow?.(tx.id)}
    >
      {selectable && (
        <span className="tx-check">
          <Checkbox checked={!!selected} onChange={(_, e) => onToggle?.(tx.id, e)} label={`Pilih ${v.title}`} />
        </span>
      )}
      {onOpen ? (
        <button
          type="button"
          className="tx-trigger"
          aria-label={label}
          onFocus={() => onFocusRow?.(tx.id)}
          onClick={() => onOpen(tx)}
        >
          {body}
        </button>
      ) : (
        <div className="tx-trigger static">{body}</div>
      )}
    </div>
  );
});
