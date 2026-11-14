import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
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
import { accountBalanceSeries, walletBalances } from '../accounting/reports';
import type { Account } from '../accounting/types';
import { formatDate, formatMoney, round2, isZero, startOfMonth, todayISO } from '../lib/format';
import { PageHeader } from '../components/layout/Topbar';
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
      <motion.div
        key={a.id}
        className={`card wallet-card${a.archived ? ' archived' : ''}`}
        style={{ '--c': a.color } as React.CSSProperties}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0, transition: { delay: i * 0.03, type: 'spring', stiffness: 300, damping: 28 } }}
        onClick={() => nav(`/buku-besar?akun=${a.id}`)}
        role="link"
        tabIndex={0}
        aria-label={`${a.name}: buka buku besar`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target === e.currentTarget) nav(`/buku-besar?akun=${a.id}`);
        }}
      >
        <div className="wc-top">
          <IconTile icon={a.icon} color={a.color} solid />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="wc-name truncate">{a.name}</div>
            <div className="wc-type">
              {SUBTYPE_META[a.subtype].label} · <span className="num">{a.code}</span>
            </div>
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <Menu
              items={[
                { label: 'Ubah', icon: Pencil, onSelect: () => modal.openEdit('wallet', a) },
                { label: 'Transfer dari akun ini', icon: ArrowLeftRight, onSelect: () => openTx({ type: 'transfer', accountId: a.id }) },
                { label: 'Sesuaikan saldo…', icon: Scale, onSelect: () => setRecon(a) },
                { label: 'Buka buku besar', icon: BookOpenText, onSelect: () => nav(`/buku-besar?akun=${a.id}`) },
                { separator: true },
                a.archived
                  ? { label: 'Aktifkan kembali', icon: ArchiveRestore, onSelect: () => notify(`${a.name} diaktifkan`, updateAccount(a.id, { archived: false }, 'Aktifkan akun')) }
                  : { label: 'Arsipkan', icon: Archive, onSelect: () => notify(`${a.name} diarsipkan`, updateAccount(a.id, { archived: true }, 'Arsipkan akun')) },
              ]}
              trigger={(p) => (
                <button type="button" className="tb-btn" ref={p.ref} onClick={p.onClick} aria-label="Menu akun">
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
                <span className="muted"> · 30 hari</span>
              </span>
            )}
          </span>
          <Sparkline values={series} color={a.color} width={110} height={34} />
        </div>
      </motion.div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Dompet & Rekening"
        subtitle="Kas, bank, dompet digital, investasi, dan kartu kredit"
        actions={
          <>
            <Button icon={ArrowLeftRight} onClick={() => openTx({ type: 'transfer' })}>
              Transfer
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => modal.openNew('wallet')}>
              Tambah akun
            </Button>
          </>
        }
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
          <EmptyState icon={Wallet} title="Belum ada dompet" text="Tambahkan kas, rekening bank, atau dompet digital untuk mulai mencatat." action={<Button variant="primary" icon={Plus} onClick={() => modal.openNew('wallet')}>Tambah akun</Button>} />
        </div>
      ) : (
        <div className="wallet-grid">
          {[...active]
            .sort((x, y) => GROUP_ORDER.indexOf(x.account.subtype as (typeof GROUP_ORDER)[number]) - GROUP_ORDER.indexOf(y.account.subtype as (typeof GROUP_ORDER)[number]) || x.account.code.localeCompare(y.account.code))
            .map(card)}
          <button type="button" className="add-tile in-grid" onClick={() => modal.openNew('wallet')}>
            <Plus />
            <span>Tambah akun</span>
          </button>
        </div>
      )}


      {archived.length > 0 && (
        <section className="wallet-group">
          <button type="button" className="wg-head toggle" onClick={() => setShowArchived((v) => !v)}>
            <h3>Diarsipkan ({archived.length})</h3>
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
  const liab = account.subtype === 'credit_card';
  const [date, setDate] = useState(todayISO());
  // Saldo buku dihitung per TANGGAL PENYESUAIAN yang dipilih, bukan per hari ini.
  // Untuk kartu kredit, "saldo" = jumlah terutang (positif = berhutang).
  const book = useMemo(() => walletBalances(b, date).find((w) => w.account.id === account.id)?.balance ?? 0, [b, date, account.id]);
  const [actual, setActual] = useState<number | null>(() => walletBalances(b, todayISO()).find((w) => w.account.id === account.id)?.balance ?? 0);
  const typed = actual ?? 0;
  // selisih dari sudut pandang kekayaan: + = bertambah (pendapatan), − = berkurang (beban)
  const diff = round2(liab ? book - typed : typed - book);
  const submit = () => {
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
          <Button variant="primary" onClick={submit}>
            {isZero(diff) ? 'Sudah sesuai' : 'Catat penyesuaian'}
          </Button>
        </>
      }
    >
      <div className="stack" data-form onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && (e.preventDefault(), submit())}>
        <div className="recon-row">
          <span className="muted">{liab ? 'Tagihan menurut buku' : 'Saldo menurut buku'} per {formatDate(date)}</span>
          <strong className="num money-val">{formatMoney(book)}</strong>
        </div>
        <Field label={liab ? 'Tagihan aktual (jumlah terutang)' : 'Saldo aktual'} hint={liab ? 'Isi negatif bila ada kelebihan bayar' : undefined}>
          <AmountInput value={actual} onChange={setActual} autoFocus allowNegative />
        </Field>
        <Field label="Tanggal penyesuaian">
          <DatePicker value={date} onChange={setDate} />
        </Field>
        <div className={`recon-diff ${isZero(diff) ? '' : diff > 0 ? 'up' : 'down'}`}>
          <span>Selisih</span>
          <strong className="num">{formatMoney(diff, { sign: 'always' })}</strong>
          <span className="muted" style={{ fontSize: 12 }}>
            {isZero(diff) ? 'Tidak ada penyesuaian' : diff > 0 ? '→ Pendapatan Lain-lain' : '→ Beban Lain-lain'}
          </span>
        </div>
      </div>
    </Modal>
  );
}
