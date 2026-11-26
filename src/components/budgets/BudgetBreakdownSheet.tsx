import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  ChevronRight,
  CircleCheck,
  Flame,
  Handshake,
  Info,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  TriangleAlert,
  X,
} from '../../lib/glyphs';
import {
  budgetBreakdown,
  budgetStatus,
  budgetThreeMonthAverage,
  type BudgetLine,
} from '../../accounting/budgets';
import type { Books } from '../../accounting/reports';
import { formatDate, formatMoney, formatMonth, formatPercent } from '../../lib/format';
import { usePrefs, useUI } from '../../store/ui';
import { Sheet } from '../ui/Modal';
import { Tooltip } from '../ui/Tooltip';
import { Badge, Button, EmptyState, IconTile, Money, Progress } from '../ui/primitives';

interface Props {
  line: BudgetLine | null;
  b: Books;
  month: string;
  from: string;
  actualTo: string;
  isCurrent: boolean;
  pace: number;
  onClose: () => void;
  onEdit: (line: BudgetLine) => void;
  onDelete: (line: BudgetLine) => void;
}

const STATUS_META = {
  over: { tone: 'neg' as const, label: 'Melebihi', icon: Flame },
  warn: { tone: 'warn' as const, label: 'Waspada', icon: TriangleAlert },
  safe: { tone: 'pos' as const, label: 'Aman', icon: CircleCheck },
};

export function BudgetBreakdownSheet({
  line,
  b,
  month,
  from,
  actualTo,
  isCurrent,
  pace,
  onClose,
  onEdit,
  onDelete,
}: Props) {
  const openTx = useUI((s) => s.openTx);
  const editTx = useUI((s) => s.editTx);
  const mode = usePrefs((s) => s.mode);

  const items = useMemo(
    () => (line ? budgetBreakdown(b, line, from, actualTo) : []),
    [b, line, from, actualTo],
  );

  const avg = useMemo(() => {
    if (!line) return { average: 0, activeMonths: 0 };
    return budgetThreeMonthAverage(
      b,
      line.kind === 'debt' ? { kind: 'debt', debtId: line.debtId } : { kind: 'expense', categoryId: line.categoryId },
      month,
    );
  }, [b, line, month]);

  const st = line ? budgetStatus(line.used, pace) : 'safe';
  const sm = STATUS_META[st];
  const barColor = st === 'over' ? 'var(--neg)' : st === 'warn' ? 'var(--warn)' : line?.color ?? 'var(--accent-ink)';

  const periodSubtitle = isCurrent
    ? `1–${Number(actualTo.slice(8))} ${formatMonth(month)}`
    : formatMonth(month);

  const txLink = line
    ? line.kind === 'expense'
      ? `/transaksi?kategori=${line.categoryId}&bulan=${month}`
      : line.debtId
        ? `/transaksi?jenis=debt_payment&induk=${line.debtId}&bulan=${month}`
        : `/transaksi?jenis=debt_payment&bulan=${month}`
    : '/transaksi';

  const handleQuickRecord = () => {
    if (!line) return;
    if (line.kind === 'expense') {
      openTx({ type: 'expense', categoryId: line.categoryId });
    } else if (line.debtId && line.debt && !line.isPaidOff) {
      openTx({ type: 'payable_pay', parentId: line.debtId, amount: line.debt.remaining });
    } else {
      openTx({ type: 'payable_pay' });
    }
  };

  const showPayAction = line && (line.kind === 'expense' || !line.isPaidOff);

  return (
    <Sheet
      open={!!line}
      onClose={onClose}
      width={500}
      ariaLabel={line ? `Rincian anggaran ${line.label}` : undefined}
    >
      {line && (
        <div className="debt-sheet budget-sheet">
          <div className="dsh-head">
            <IconTile icon={line.icon} color={line.color} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="modal-title truncate">{line.label}</div>
              <div className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
                {line.kind === 'debt' ? 'Anggaran pembayaran hutang' : 'Anggaran pengeluaran'} · {periodSubtitle}
              </div>
            </div>
            <button type="button" className="close-btn" onClick={onClose} aria-label="Tutup">
              <X />
            </button>
          </div>

          <div className="dsh-body">
            <div className="dsh-hero">
              <div className="bsh-hero-top">
                <span className="kpi-label">Realisasi</span>
                <div className="bsh-hero-badges">
                  <Badge tone={sm.tone} icon={sm.icon}>
                    {sm.label}
                  </Badge>
                  {line.kind === 'debt' && line.isPaidOff && (
                    <Badge tone="pos" icon={CircleCheck}>
                      Lunas
                    </Badge>
                  )}
                </div>
              </div>
              <div className="bsh-total">
                <strong className={`num money-val${line.used > 1 ? ' neg' : ''}`}>{formatMoney(line.actual)}</strong>
                <span className="muted">
                  dari <span className="money-val">{formatMoney(line.budget)}</span>
                </span>
              </div>
              <div className="bsh-progress">
                <Progress
                  value={line.used}
                  color={barColor}
                  marker={pace}
                  label={`Anggaran ${line.label} terpakai`}
                />
                {isCurrent && (
                  <span className="muted bsh-pace-hint">Laju waktu berjalan {formatPercent(pace, 0)}</span>
                )}
              </div>
              <div className="dsh-grid">
                <div>
                  <span>{line.variance >= 0 ? 'Sisa' : 'Melebihi'}</span>
                  <Money value={Math.abs(line.variance)} className={line.variance < 0 ? 'neg' : ''} />
                </div>
                <div>
                  <span>Terpakai</span>
                  <strong className="num">{formatPercent(line.used, 0)}</strong>
                </div>
                <div>
                  <span>{avg.activeMonths > 0 && avg.activeMonths < 3 ? `Rata-rata ${avg.activeMonths} bln` : 'Rata-rata 3 bln'}</span>
                  {avg.average > 0 ? <Money value={avg.average} /> : <strong className="muted">—</strong>}
                </div>
              </div>
            </div>

            {line.kind === 'debt' && line.debt && (
              <Link to="/hutang-piutang" onClick={onClose} className="bsh-link-card">
                <IconTile icon="handshake" color="var(--tone-payable)" size="sm" />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="bsh-link-title">Sisa pokok hutang</div>
                  <div className="muted truncate" style={{ fontSize: 'var(--fs-xs)' }}>
                    {line.debt.tx.description || line.debt.tx.ref}
                  </div>
                </div>
                <Money value={line.debt.remaining} />
                <ChevronRight size={15} className="muted" />
              </Link>
            )}

            {line.kind === 'debt' && line.isCreditPurchase && (
              <div className="note-box bsh-note">
                <Info size={16} style={{ flex: 'none', marginTop: 2 }} />
                <span>
                  Beban transaksi ini sudah diakui saat pembelian kredit. Anggaran ini memantau arus kas keluar saat pelunasannya.
                </span>
              </div>
            )}

            <section className="bsh-section">
              <div className="bsh-sec-head">
                <span className="label-caps">
                  {line.kind === 'debt' ? 'Rincian pembayaran' : 'Rincian transaksi'} ({items.length})
                </span>
                <Link to={txLink} onClick={onClose} className="link bsh-see-all">
                  Lihat di Transaksi
                </Link>
              </div>

              {items.length === 0 ? (
                <div className="bsh-empty">
                  <EmptyState
                    compact
                    heading="h3"
                    icon={line.kind === 'debt' ? Handshake : Receipt}
                    title={line.kind === 'debt' ? 'Belum ada pembayaran' : 'Belum ada transaksi'}
                    text={
                      line.kind === 'debt'
                        ? 'Pembayaran hutang pada bulan ini akan tampil di sini.'
                        : 'Pengeluaran untuk kategori ini pada bulan ini akan tampil di sini.'
                    }
                  />
                </div>
              ) : (
                <div className="bsh-list">
                  {items.map((item) => {
                    const rowIcon = item.tx
                      ? line.kind === 'debt'
                        ? 'handshake'
                        : line.icon
                      : 'building-2';
                    const rowColor = item.isRefund ? 'var(--pos)' : line.color;
                    const rowContent = (
                      <>
                        <IconTile icon={rowIcon} color={rowColor} size="sm" />
                        <div className="bsh-item-main">
                          <div className="bsh-item-title truncate">{item.title}</div>
                          <div className="bsh-item-sub muted truncate">
                            {formatDate(item.date)}
                            {item.subtitle ? ` · ${item.subtitle}` : ''}
                          </div>
                        </div>
                        <div className="bsh-item-amt">
                          <span className={`num money-val${item.isRefund ? ' pos' : ''}`}>
                            {item.isRefund ? `−${formatMoney(Math.abs(item.amount))}` : formatMoney(item.amount)}
                          </span>
                          {!item.tx && <span className="bsh-auto">Otomatis</span>}
                        </div>
                        <ChevronRight size={14} className="bsh-chev" aria-hidden />
                      </>
                    );
                    if (item.tx) {
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className="bsh-item"
                          onClick={() => editTx(item.tx!)}
                        >
                          {rowContent}
                        </button>
                      );
                    }
                    return (
                      <Link key={item.id} to="/aset" onClick={onClose} className="bsh-item">
                        {rowContent}
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            {line.kind === 'expense' && mode === 'accountant' && (
              <div className="bsh-extra-links">
                <Link to={`/buku-besar?akun=${line.categoryId}`} onClick={onClose} className="bsh-ledger-link">
                  <BookOpen size={15} />
                  <span>Buka Buku Besar {line.label}</span>
                  <ChevronRight size={15} className="muted" />
                </Link>
              </div>
            )}
          </div>

          <div className="dsh-foot">
            <Tooltip label="Hapus anggaran">
              <Button
                variant="danger-ghost"
                size="sm"
                icon={Trash2}
                onClick={() => onDelete(line)}
                aria-label={`Hapus anggaran ${line.label}`}
              />
            </Tooltip>
            <span className="spacer" />
            <Button
              size="sm"
              icon={Pencil}
              onClick={() => onEdit(line)}
            >
              Ubah batas
            </Button>
            {showPayAction && (
              <Button
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={handleQuickRecord}
              >
                {line.kind === 'debt' ? 'Bayar hutang' : 'Catat pengeluaran'}
              </Button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
