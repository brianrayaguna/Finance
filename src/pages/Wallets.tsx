import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { enter } from '../lib/motion';
import {
  Plus,
  Ellipsis,
  Pencil,
  ArrowLeftRight,
  BookOpenText,
  Scale,
  Archive,
  ArchiveRestore,
  Wallet,
  ChevronDown,
} from '../lib/glyphs';
import { useBooks, useToday } from '../hooks/useApp';
import { useUI } from '../store/ui';
import { addTransaction, updateAccount } from '../store/data';
import { notify } from '../store/history';
import { SUBTYPE_META, SYS } from '../accounting/coa';
import { isLocked } from '../accounting/lock';
import { accountBalanceSeries, walletBalances } from '../accounting/reports';
import type { Account } from '../accounting/types';
import { addDays, formatDate, formatMoney, round2, isZero, startOfMonth } from '../lib/format';
import { useSubmitRef } from '../lib/focus';
import { isImeComposing } from '../lib/layers';
import { PageHeader } from '../components/layout/Page';
import { AnimatedMoney, Button, EmptyState, IconTile, Money, Field } from '../components/ui/primitives';
import { Menu } from '../components/ui/Popover';
import { Sparkline } from '../components/charts/Charts';
import { Modal } from '../components/ui/Modal';
import { AmountInput } from '../components/ui/AmountInput';
import { DatePicker } from '../components/ui/DatePicker';
import { useAccountModal } from '../components/forms/AccountModal';

const GROUP_ORDER = ['cash', 'bank', 'ewallet', 'investment', 'credit_card'] as const;

export default function Wallets() {
  const b = useBooks();
  const today = useToday();
  const nav = useNavigate();
  const openTx = useUI((s) => s.openTx);
  const modal = useAccountModal();
  const [showArchived, setShowArchived] = useState(false);
  const [recon, setRecon] = useState<Account | null>(null);

  const list = useMemo(() => walletBalances(b, today), [b, today]);
  const monthCounts = useMemo(() => {
    const m = new Map<string, number>();
    const from = startOfMonth(today);
    for (const t of b.data.transactions) {
      if (t.date < from || t.date > today) continue;
      for (const id of [t.accountId, t.toAccountId]) if (id) m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [b, today]);

  const active = list.filter((w) => !w.account.archived);
  const archived = list.filter((w) => w.account.archived);
  const sum = (pred: (a: Account) => boolean) => active.filter((w) => pred(w.account)).reduce((s, w) => s + w.balance, 0);
  const cash = sum((a) => ['cash', 'bank', 'ewallet'].includes(a.subtype));
  const inv = sum((a) => a.subtype === 'investment');
  const cc = sum((a) => a.subtype === 'credit_card');

  const card = (w: (typeof list)[number], i: number) => {
    const a = w.account;
    const liab = a.subtype === 'credit_card';
    // Kartu kredit: tampilkan jumlah terutang sebagai angka positif (bukan "tagihan −Rp…").
    const shown = liab ? Math.abs(w.balance) : w.balance;
    const overpaid = liab && w.balance < 0;
    const series = accountBalanceSeries(b, a.id, 30, today).map((v) => (liab ? -v : v));
    const trend = series.length > 1 ? series[series.length - 1] - series[0] : 0;
    return (
      <div
        key={a.id}
        className={`card wallet-card${a.archived ? ' archived' : ''}`}
        {...enter(i, { '--c': a.color } as React.CSSProperties)}
      >
        <div className="wc-top">
          <IconTile icon={a.icon} color={a.color} solid />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="wc-name">
              <Link to={`/buku-besar?akun=${a.id}`} className="stretch-trigger truncate" aria-label={`${a.name}: buka buku besar`}>
                {a.name}
              </Link>
            </div>
            <div className="wc-type">
              {SUBTYPE_META[a.subtype].label}, <span className="num">{a.code}</span>
            </div>
          </div>
          <div className="row-front">
            <Menu
              items={[
                { label: 'Ubah', icon: Pencil, onSelect: () => modal.openEdit('wallet', a) },
                { label: 'Transfer dari akun ini', icon: ArrowLeftRight, onSelect: () => openTx({ type: 'transfer', accountId: a.id }) },
                { label: 'Sesuaikan saldo…', icon: Scale, onSelect: () => setRecon(a) },
                { label: 'Buka buku besar', icon: BookOpenText, onSelect: () => nav(`/buku-besar?akun=${a.id}`) },
                { separator: true },
                a.archived
                  ? {
                      label: 'Aktifkan kembali',
                      icon: ArchiveRestore,
                      onSelect: () => {
                        const hid = updateAccount(a.id, { archived: false }, 'Aktifkan akun');
                        if (hid) notify(`${a.name} diaktifkan`, hid);
                      },
                    }
                  : {
                      label: 'Arsipkan',
                      icon: Archive,
                      onSelect: () => {
                        const hid = updateAccount(a.id, { archived: true }, 'Arsipkan akun');
                        if (hid) notify(`${a.name} diarsipkan`, hid);
                      },
                    },
              ]}
              trigger={(p) => (
                <button
                  type="button"
                  className="tb-btn"
                  ref={p.ref}
                  onClick={p.onClick}
                  aria-expanded={p['aria-expanded']}
                  aria-haspopup={p['aria-haspopup']}
                  aria-label="Menu akun"
                >
                  <Ellipsis />
                </button>
              )}
            />
          </div>
        </div>
        <div className="wc-bal">
          <span className="muted">{liab ? (overpaid ? 'Kelebihan bayar' : 'Tagihan terutang') : 'Saldo'}</span>
          <strong className={(liab ? !overpaid && shown > 0 : shown < 0) ? 'neg' : ''}>
            <AnimatedMoney value={shown} />
          </strong>
        </div>
        <div className="wc-foot">
          <span className="wc-stats">
            <span className="muted">{monthCounts.get(a.id) ?? 0} transaksi bulan ini</span>
            {!isZero(trend) && (
              <span className={`wc-trend ${trend > 0 ? 'pos' : 'neg'}`}>
                {trend > 0 ? '▲' : '▼'} <span className="money-val">{formatMoney(Math.abs(trend), { compact: true })}</span>
                <span className="muted"> dalam 30 hari</span>
              </span>
            )}
          </span>
          <Sparkline values={series} color={a.color} width={110} height={34} />
        </div>
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Dompet & Rekening"
        subtitle="Kas, bank, dompet digital, investasi, dan kartu kredit"
        primaryAction={{ label: 'Tambah dompet', icon: Plus, onSelect: () => modal.openNew('wallet') }}
      />
      <div className="sum-strip big">
        <div>
          <span>Kas & setara kas</span>
          <Money value={cash} />
        </div>
        <div>
          <span>Investasi</span>
          <Money value={inv} />
        </div>
        <div>
          <span>Kartu kredit / PayLater</span>
          <Money value={-cc} className={cc > 0 ? 'neg' : ''} />
        </div>
        <div>
          <span>Posisi bersih</span>
          <Money value={cash + inv - cc} />
        </div>
      </div>

      {active.length === 0 ? (
        <div className="card">
          <EmptyState icon={Wallet} title="Belum ada dompet" text="Tambahkan kas, rekening bank, atau dompet digital untuk mulai mencatat." action={<Button variant="primary" icon={Plus} onClick={() => modal.openNew('wallet')}>Tambah dompet</Button>} />
        </div>
      ) : (
        <div className="wallet-grid">
          {[...active]
            .sort((x, y) => GROUP_ORDER.indexOf(x.account.subtype as (typeof GROUP_ORDER)[number]) - GROUP_ORDER.indexOf(y.account.subtype as (typeof GROUP_ORDER)[number]) || x.account.code.localeCompare(y.account.code))
            .map(card)}
          <button type="button" className="add-tile in-grid" onClick={() => modal.openNew('wallet')}>
            <Plus />
            <span>Tambah dompet</span>
          </button>
        </div>
      )}


      {archived.length > 0 && (
        <section className="wallet-group">
          <button type="button" className="wg-head toggle" onClick={() => setShowArchived((v) => !v)}>
            <h2>Diarsipkan ({archived.length})</h2>
            <ChevronDown size={16} style={{ transform: showArchived ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
          </button>
          {showArchived && <div className="wallet-grid">{archived.map(card)}</div>}
        </section>
      )}
      {modal.node}
      {recon && <ReconcileModal account={recon} onClose={() => setRecon(null)} />}
    </div>
  );
}

function ReconcileModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const b = useBooks();
  const today = useToday();
  const liab = account.subtype === 'credit_card';
  const lockDate = b.data.profile.lockDate;
  const [date, setDate] = useState(today);
  const dateLocked = isLocked(date, lockDate);
  // Saldo buku dihitung per TANGGAL PENYESUAIAN yang dipilih, bukan per hari ini.
  // Untuk kartu kredit, "saldo" = jumlah terutang (positif = berhutang).
  const book = useMemo(() => walletBalances(b, date).find((w) => w.account.id === account.id)?.balance ?? 0, [b, date, account.id]);
  const [actual, setActual] = useState<number | null>(book);
  const [edited, setEdited] = useState(false);
  const handleDateChange = (nextDate: string) => {
    setDate(nextDate);
    if (!edited) {
      const nextBook = walletBalances(b, nextDate).find((w) => w.account.id === account.id)?.balance ?? 0;
      setActual(nextBook);
    }
  };
  const typed = actual ?? 0;
  // selisih dari sudut pandang kekayaan: + = bertambah (pendapatan), − = berkurang (beban)
  const diff = round2(liab ? book - typed : typed - book);
  const submit = () => {
    if (dateLocked) return;
    if (isZero(diff)) return onClose();
    const gain = diff > 0;
    const { tx, historyId } = addTransaction(
      {
        type: gain ? 'income' : 'expense',
        date,
        amount: Math.abs(diff),
        accountId: account.id,
        categoryId: gain ? SYS.otherIncome : SYS.otherExpense,
        description: `Penyesuaian saldo ${account.name}`,
        note: `${liab ? 'Tagihan' : 'Saldo'} buku ${formatMoney(book)} → aktual ${formatMoney(typed)}`,
      },
      'Penyesuaian saldo',
    );
    if (!historyId) return; // ditolak kunci periode — biarkan formulir terbuka
    notify(`Saldo ${account.name} disesuaikan`, historyId, { detail: tx.ref });
    onClose();
  };
  const submitRef = useSubmitRef(submit);
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Sesuaikan saldo"
      subtitle={account.name}
      icon={<IconTile icon={account.icon} color={account.color} solid size="lg" />}
      footer={
        <>
          <span className="spacer" />
          <Button onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={() => submitRef.run()} disabled={dateLocked}>
            {isZero(diff) ? 'Sudah sesuai' : 'Catat penyesuaian'}
          </Button>
        </>
      }
    >
      <div
        className="stack"
        data-form
        onKeyDown={(e) => {
          if (!isImeComposing(e) && e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
            e.preventDefault();
            submitRef.runFrom(e.target);
          }
        }}
      >
        <div className="recon-row">
          <span className="muted">{liab ? 'Tagihan menurut buku' : 'Saldo menurut buku'} per {formatDate(date)}</span>
          <strong className="num money-val">{formatMoney(book)}</strong>
        </div>
        <Field label={liab ? 'Tagihan aktual (jumlah terutang)' : 'Saldo aktual'} hint={liab ? 'Isi negatif bila ada kelebihan bayar' : undefined}>
          <AmountInput
            value={actual}
            onChange={(v) => {
              setEdited(true);
              setActual(v);
            }}
            autoFocus
            allowNegative
          />
        </Field>
        <Field label="Tanggal penyesuaian" error={dateLocked ? `Periode sampai ${formatDate(lockDate!)} sudah dikunci` : undefined}>
          <DatePicker value={date} onChange={handleDateChange} min={lockDate ? addDays(lockDate, 1) : undefined} invalid={dateLocked} />
        </Field>
        <div className={`recon-diff ${isZero(diff) ? '' : diff > 0 ? 'up' : 'down'}`}>
          <span>Selisih</span>
          <strong className="num money-val">{formatMoney(diff, { sign: 'always' })}</strong>
          <span className="muted" style={{ fontSize: 12 }}>
            {isZero(diff) ? 'Tidak ada penyesuaian' : diff > 0 ? '→ Pendapatan Lain-lain' : '→ Beban Lain-lain'}
          </span>
        </div>
      </div>
    </Modal>
  );
}
