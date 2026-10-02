import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Handshake, HandCoins, Search, Ellipsis, Pencil, Trash2, Eye, CircleCheck, Receipt, X, CalendarClock } from 'lucide-react';
import { useBooks, useToday } from '../hooks/useApp';
import { useUI, confirm } from '../store/ui';
import { deleteTransactions, childCount } from '../store/data';
import { notify } from '../store/history';
import { debtInfos, AGING_BUCKETS, type DebtInfo } from '../accounting/reports';
import { formatDate, formatMoney, initials, normalize, relativeDay } from '../lib/format';
import { PALETTE } from '../lib/icons';
import { PageHeader } from '../components/layout/Topbar';
import { Badge, Button, EmptyState, Money, Progress, TextInput, IconTile } from '../components/ui/primitives';
import { Segmented } from '../components/ui/Segmented';
import { Menu } from '../components/ui/Popover';
import { Sheet } from '../components/ui/Modal';
import { Tooltip } from '../components/ui/Tooltip';

const hue = (s: string) => {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
};

function Avatar({ name }: { name: string }) {
  const c = PALETTE[hue(name) % PALETTE.length].value;
  return (
    <span className="contact-av" style={{ '--c': c } as React.CSSProperties}>
      {initials(name)}
    </span>
  );
}

function StatusBadge({ d }: { d: DebtInfo }) {
  if (d.status === 'paid') return <Badge tone="pos" icon={CircleCheck}>Lunas</Badge>;
  if (d.status === 'overdue') return <Badge tone="neg" dot>Lewat {-(d.daysToDue ?? 0)} hari</Badge>;
  if (d.status === 'due_soon') return <Badge tone="warn" dot>{d.daysToDue === 0 ? 'Jatuh tempo hari ini' : `${d.daysToDue} hari lagi`}</Badge>;
  if (d.tx.dueDate) return <Badge dot>JT {formatDate(d.tx.dueDate)}</Badge>;
  return <Badge>Tanpa jatuh tempo</Badge>;
}

export default function Debts() {
  const b = useBooks();
  const today = useToday();
  const openTx = useUI((s) => s.openTx);
  const editTx = useUI((s) => s.editTx);
  const [kind, setKind] = useState<'payable' | 'receivable'>('payable');
  const [status, setStatus] = useState<'active' | 'paid' | 'all'>('active');
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState<string | null>(null);

  const all = useMemo(() => debtInfos(b.data, today), [b, today]);
  const ofKind = all.filter((d) => d.kind === kind);
  const list = ofKind.filter((d) => {
    if (status === 'active' && d.status === 'paid') return false;
    if (status === 'paid' && d.status !== 'paid') return false;
    if (q && !normalize(`${d.tx.contact} ${d.tx.description} ${d.tx.ref}`).includes(normalize(q))) return false;
    return true;
  });

  const open = ofKind.filter((d) => d.status !== 'paid');
  const total = open.reduce((s, d) => s + d.remaining, 0);
  const overdue = open.filter((d) => d.status === 'overdue');
  const soon = open.filter((d) => d.daysToDue !== null && d.daysToDue >= 0 && d.daysToDue <= 30);
  const interest = ofKind.reduce((s, d) => s + d.interest, 0);

  const aging = useMemo(() => {
    const buckets = [0, 0, 0, 0, 0];
    for (const d of open) {
      const over = d.daysToDue === null ? 0 : -d.daysToDue;
      const i = over <= 0 ? 0 : over <= 30 ? 1 : over <= 60 ? 2 : over <= 90 ? 3 : 4;
      buckets[i] += d.remaining;
    }
    return buckets;
  }, [open]);
  const agingColors = ['var(--pos)', '#B8912A', '#C8792C', '#B8603C', 'var(--neg)'];

  const payLabel = kind === 'payable' ? 'Bayar' : 'Terima';
  const act = (d: DebtInfo) => openTx({ type: kind === 'payable' ? 'payable_pay' : 'receivable_collect', parentId: d.tx.id, amount: d.remaining });

  const remove = async (d: DebtInfo) => {
    const kids = childCount([d.tx.id]);
    const ok = await confirm({
      title: `Hapus ${kind === 'payable' ? 'hutang' : 'piutang'} ${d.tx.contact}?`,
      message: kids ? `Termasuk ${kids} catatan pembayaran. Tindakan ini dapat diurungkan.` : 'Tindakan ini dapat diurungkan.',
      confirmLabel: 'Hapus',
      tone: 'danger',
    });
    if (!ok) return;
    const hid = deleteTransactions([d.tx.id]);
    if (!hid) return;
    setDetail(null);
    notify('Catatan dihapus', hid, { tone: 'danger' });
  };

  const current = all.find((d) => d.tx.id === detail) ?? null;

  return (
    <div>
      <PageHeader
        title="Hutang & Piutang"
        subtitle="Buku pembantu per kontak dengan jadwal jatuh tempo"
        actions={
          <>
            <Button icon={HandCoins} onClick={() => openTx({ type: 'receivable_new' })}>
              Piutang baru
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => openTx({ type: 'payable_new' })}>
              Hutang baru
            </Button>
          </>
        }
      />

      <div className="row" style={{ marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <Segmented
          value={kind}
          onChange={(v) => setKind(v)}
          options={[
            { value: 'payable', label: `Hutang (${all.filter((d) => d.kind === 'payable' && d.status !== 'paid').length})`, icon: Handshake },
            { value: 'receivable', label: `Piutang (${all.filter((d) => d.kind === 'receivable' && d.status !== 'paid').length})`, icon: HandCoins },
          ]}
        />
      </div>

      <div className="debt-summary">
        <div className="card ds-main">
          <span className="kpi-label">{kind === 'payable' ? 'Total hutang berjalan' : 'Total piutang berjalan'}</span>
          <strong className="ds-total num money-val">{formatMoney(total)}</strong>
          <div className="aging-bar">
            {aging.map((v, i) =>
              v > 0 ? (
                <Tooltip key={i} label={`${AGING_BUCKETS[i]} · ${formatMoney(v)}`}>
                  <span style={{ flex: v, background: agingColors[i] }} />
                </Tooltip>
              ) : null,
            )}
            {total === 0 && <span style={{ flex: 1, background: 'var(--fill-2)' }} />}
          </div>
          <div className="aging-legend">
            {AGING_BUCKETS.map((l, i) => (
              <span key={l}>
                <i style={{ background: agingColors[i] }} />
                {l}
              </span>
            ))}
          </div>
        </div>
        <div className="card ds-kpi">
          <span className="kpi-label">Lewat jatuh tempo</span>
          <strong className={`num money-val ${overdue.length ? 'neg' : ''}`}>{formatMoney(overdue.reduce((s, d) => s + d.remaining, 0))}</strong>
          <span className="muted">{overdue.length} catatan</span>
        </div>
        <div className="card ds-kpi">
          <span className="kpi-label">Jatuh tempo ≤ 30 hari</span>
          <strong className="num money-val">{formatMoney(soon.reduce((s, d) => s + d.remaining, 0))}</strong>
          <span className="muted">{soon.length} catatan</span>
        </div>
        <div className="card ds-kpi">
          <span className="kpi-label">{kind === 'payable' ? 'Bunga dibayar' : 'Bunga diterima'}</span>
          <strong className="num money-val">{formatMoney(interest)}</strong>
          <span className="muted">{ofKind.filter((d) => d.status === 'paid').length} catatan telah lunas</span>
        </div>
      </div>

      <div className="card debt-list" style={{ marginTop: 16 }}>
        <div className="list-toolbar">
          <div className="lt-row">
            <Segmented
              size="sm"
              value={status}
              onChange={setStatus}
              options={[
                { value: 'active', label: 'Berjalan' },
                { value: 'paid', label: 'Lunas' },
                { value: 'all', label: 'Semua' },
              ]}
            />
            <div className="fb-search" style={{ maxWidth: 340, marginLeft: 'auto' }}>
              <TextInput value={q} onChange={setQ} icon={Search} placeholder="Cari kontak atau keterangan…" clearable sunken />
            </div>
          </div>
        </div>
        {list.length === 0 ? (
          <EmptyState
            icon={kind === 'payable' ? Handshake : HandCoins}
            title={status === 'paid' ? 'Belum ada yang lunas' : kind === 'payable' ? 'Tidak ada hutang berjalan' : 'Tidak ada piutang berjalan'}
            text={kind === 'payable' ? 'Catat pinjaman yang Anda terima atau pembelian secara kredit.' : 'Catat uang yang Anda pinjamkan atau penjualan secara kredit.'}
            action={
              <Button variant="primary" icon={Plus} onClick={() => openTx({ type: kind === 'payable' ? 'payable_new' : 'receivable_new' })}>
                {kind === 'payable' ? 'Catat hutang' : 'Catat piutang'}
              </Button>
            }
          />
        ) : (
          <AnimatePresence initial={false}>
            {list.map((d) => {
              const pct = d.tx.amount ? (d.paid + d.writtenOff) / d.tx.amount : 0;
              return (
                <motion.div
                  key={d.tx.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={`debt-row st-${d.status}`}
                  onClick={() => setDetail(d.tx.id)}
                  role="link"
                  tabIndex={0}
                  aria-label={`${d.tx.contact || 'Tanpa nama'}, sisa ${formatMoney(d.remaining)}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.target === e.currentTarget) setDetail(d.tx.id);
                  }}
                >
                  <Avatar name={d.tx.contact || '?'} />
                  <div className="dr-main">
                    <div className="row" style={{ gap: 8 }}>
                      <strong className="truncate">{d.tx.contact}</strong>
                      <StatusBadge d={d} />
                    </div>
                    <div className="muted truncate" style={{ fontSize: 13 }}>
                      {d.tx.description || '—'} · {formatDate(d.tx.date)} · {d.tx.ref}
                    </div>
                  </div>
                  <div className="dr-progress">
                    <Progress value={pct} thin label="Porsi terbayar" color={d.status === 'paid' ? 'var(--pos)' : kind === 'payable' ? 'var(--tone-payable)' : 'var(--tone-receivable)'} />
                    <span className="muted num" style={{ fontSize: 12 }}>
                      {Math.round(pct * 100)}% · {d.payments.length}× {kind === 'payable' ? 'bayar' : 'terima'}
                    </span>
                  </div>
                  <div className="dr-amt">
                    <Money value={d.remaining} className={d.status === 'overdue' ? 'neg' : ''} />
                    <span className="muted num money-val" style={{ fontSize: 12 }}>
                      dari {formatMoney(d.tx.amount)}
                    </span>
                  </div>
                  <div className="dr-actions" onClick={(e) => e.stopPropagation()}>
                    {d.status !== 'paid' && (
                      <Button size="sm" variant="tinted" onClick={() => act(d)}>
                        {payLabel}
                      </Button>
                    )}
                    <Menu
                      items={[
                        { label: 'Lihat detail', icon: Eye, onSelect: () => setDetail(d.tx.id) },
                        { label: 'Ubah', icon: Pencil, onSelect: () => editTx(d.tx) },
                        ...(kind === 'receivable' && d.status !== 'paid'
                          ? [{ label: 'Hapus buku sisa piutang', icon: Receipt, onSelect: () => openTx({ type: 'receivable_writeoff', parentId: d.tx.id, amount: d.remaining }) }]
                          : []),
                        { separator: true },
                        { label: 'Hapus', icon: Trash2, danger: true, onSelect: () => remove(d) },
                      ]}
                      trigger={(p) => (
                        <button type="button" className="tb-btn" ref={p.ref} onClick={p.onClick} aria-label={`Menu ${d.tx.contact ?? ''}`.trim()}>
                          <Ellipsis />
                        </button>
                      )}
                    />
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      <Sheet open={!!current} onClose={() => setDetail(null)} width={500} ariaLabel={current ? `Detail ${current.kind === 'payable' ? 'hutang' : 'piutang'} ${current.tx.contact ?? ''}` : undefined}>
        {current && (
          <div className="debt-sheet">
            <div className="dsh-head">
              <Avatar name={current.tx.contact || '?'} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="modal-title truncate">{current.tx.contact}</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {current.kind === 'payable' ? 'Hutang' : 'Piutang'} · {current.tx.ref}
                </div>
              </div>
              <button type="button" className="close-btn" onClick={() => setDetail(null)} aria-label="Tutup">
                <X />
              </button>
            </div>
            <div className="dsh-body">
              <div className="dsh-hero">
                <span className="muted">Sisa {current.kind === 'payable' ? 'hutang' : 'piutang'}</span>
                <strong className="num money-val">{formatMoney(current.remaining)}</strong>
                <Progress value={current.tx.amount ? (current.paid + current.writtenOff) / current.tx.amount : 0} label="Porsi terbayar" color={current.status === 'paid' ? 'var(--pos)' : current.kind === 'payable' ? 'var(--tone-payable)' : 'var(--tone-receivable)'} />
                <div className="dsh-grid">
                  <div>
                    <span>Pokok</span>
                    <Money value={current.tx.amount} />
                  </div>
                  <div>
                    <span>Terbayar</span>
                    <Money value={current.paid} />
                  </div>
                  <div>
                    <span>Bunga/denda</span>
                    <Money value={current.interest} />
                  </div>
                  {current.writtenOff > 0 && (
                    <div>
                      <span>Dihapusbukukan</span>
                      <Money value={current.writtenOff} className="neg" />
                    </div>
                  )}
                </div>
                <div className="row" style={{ gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <StatusBadge d={current} />
                  {current.tx.dueDate && (
                    <Badge icon={CalendarClock}>
                      {relativeDay(current.tx.dueDate, today)}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="label-caps" style={{ margin: '20px 0 10px' }}>
                Riwayat
              </div>
              <div className="timeline">
                <div className="tl-item origin">
                  <span className="tl-dot" />
                  <div className="grow">
                    <strong>{current.tx.description || (current.kind === 'payable' ? 'Hutang dicatat' : 'Piutang dicatat')}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {formatDate(current.tx.date, 'long')} · {current.tx.ref}
                    </div>
                  </div>
                  <Money value={current.tx.amount} />
                </div>
                {current.payments.map((p) => (
                  <button type="button" key={p.id} className={`tl-item${p.type === 'receivable_writeoff' ? ' wo' : ''}`} onClick={() => editTx(p)}>
                    <span className="tl-dot" />
                    <div className="grow" style={{ textAlign: 'left' }}>
                      <strong>{p.type === 'receivable_writeoff' ? 'Hapus buku' : current.kind === 'payable' ? 'Pembayaran' : 'Penerimaan'}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {formatDate(p.date, 'long')} · {p.ref}
                        {p.interest ? ` · bunga ${formatMoney(p.interest)}` : ''}
                      </div>
                    </div>
                    <Money value={-p.amount} className={p.type === 'receivable_writeoff' ? 'neg' : 'pos'} sign="always" />
                  </button>
                ))}
                {current.payments.length === 0 && <div className="muted" style={{ fontSize: 13, padding: '4px 0 0 28px' }}>Belum ada pembayaran.</div>}
              </div>
              {current.tx.note && (
                <div className="note-box">
                  <IconTile icon="pen" size="xs" color="var(--text-3)" />
                  {current.tx.note}
                </div>
              )}
            </div>
            <div className="modal-foot">
              <Button variant="danger-ghost" icon={Trash2} onClick={() => remove(current)}>
                Hapus
              </Button>
              <span className="spacer" />
              <Button icon={Pencil} onClick={() => editTx(current.tx)}>
                Ubah
              </Button>
              {current.status !== 'paid' && (
                <Button variant="primary" onClick={() => act(current)}>
                  {current.kind === 'payable' ? 'Bayar hutang' : 'Terima pembayaran'}
                </Button>
              )}
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
