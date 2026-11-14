import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  Handshake,
  HandCoins,
  Trash2,
  ChevronDown,
  CalendarClock,
  Plus,
  NotebookPen,
  CircleCheck,
  CircleAlert,
  User,
  Text,
  Star,
  Check,
  TriangleAlert,
  Lock,
  Copy,
} from '../../lib/glyphs';
import { SYS, isWallet } from '../../accounting/coa';
import { TX_META, journalizeTx, makeCtx } from '../../accounting/engine';
import { isLocked } from '../../accounting/lock';
import { bal, balancesAt, debtInfos, getBooks } from '../../accounting/reports';
import type { DebtCounter, Transaction, TxType } from '../../accounting/types';
import { addTemplate, addTransaction, deleteTransactions, getData, updateTransaction, useData, childCount } from '../../store/data';
import { confirm, usePrefs, useUI } from '../../store/ui';
import { notify } from '../../store/history';
import { addDays, formatDate, formatMoney, isoFromTs, nowTime, round2, todayISO, daysBetween } from '../../lib/format';
import { focusNext } from '../../lib/focus';
import { MOD } from '../../lib/layers';
import { Modal } from '../ui/Modal';
import { Segmented } from '../ui/Segmented';
import { AmountInput } from '../ui/AmountInput';
import { Select } from '../ui/Select';
import { DatePicker } from '../ui/DatePicker';
import { AutoComplete } from '../ui/AutoComplete';
import { Badge, Button, Field, IconTile, Kbd, Progress, Switch, TextArea } from '../ui/primitives';
import { useCategoryOptions, useContacts, useOpenDebtOptions, useWalletOptions } from './options';
import { JournalModal } from './JournalModal';

type Mode = 'expense' | 'income' | 'transfer' | 'payable' | 'receivable' | 'opening';
type Sub = 'new' | 'pay' | 'collect' | 'writeoff';

interface Draft {
  mode: Mode;
  sub: Sub;
  amount: number | null;
  date: string;
  time: string;
  accountId: string;
  toAccountId: string;
  categoryId: string;
  /** Pengembalian dana: pemasukan ke kategori beban (refund) atau pengeluaran ke kategori pendapatan */
  refund: boolean;
  fee: number | null;
  interest: number | null;
  contact: string;
  dueDate: string;
  parentId: string;
  counter: DebtCounter;
  description: string;
  note: string;
}

function modeOf(t: TxType): [Mode, Sub] {
  switch (t) {
    case 'income':
      return ['income', 'new'];
    case 'transfer':
      return ['transfer', 'new'];
    case 'payable_new':
      return ['payable', 'new'];
    case 'payable_pay':
      return ['payable', 'pay'];
    case 'receivable_new':
      return ['receivable', 'new'];
    case 'receivable_collect':
      return ['receivable', 'collect'];
    case 'receivable_writeoff':
      return ['receivable', 'writeoff'];
    case 'opening':
      return ['opening', 'new'];
    default:
      return ['expense', 'new'];
  }
}

function typeOf(mode: Mode, sub: Sub): TxType {
  if (mode === 'payable') return sub === 'pay' ? 'payable_pay' : 'payable_new';
  if (mode === 'receivable') return sub === 'collect' ? 'receivable_collect' : sub === 'writeoff' ? 'receivable_writeoff' : 'receivable_new';
  return mode as TxType;
}

function lastWallet(type: TxType): string {
  const d = getData();
  const t = [...d.transactions].sort((a, b) => b.createdAt - a.createdAt).find((x) => x.type === type && x.accountId);
  const acc = t?.accountId && d.accounts.find((a) => a.id === t.accountId && !a.archived);
  if (acc) return acc.id;
  const any = d.accounts.find((a) => isWallet(a) && !a.archived && a.subtype !== 'credit_card');
  return any?.id ?? SYS.cash;
}

/** Pemasukan ke akun beban / pengeluaran ke akun pendapatan = pengembalian dana. */
function isRefund(mode: Mode, categoryId?: string): boolean {
  const t = categoryId ? getData().accounts.find((a) => a.id === categoryId)?.type : undefined;
  return (mode === 'income' && t === 'expense') || (mode === 'expense' && t === 'revenue');
}

function initDraft(editing?: Transaction, defaults?: Partial<Transaction>): Draft {
  const src = editing ?? defaults ?? {};
  const [mode, sub] = modeOf((src.type as TxType) ?? 'expense');
  const type = typeOf(mode, sub);
  return {
    mode,
    sub,
    amount: src.amount ?? null,
    date: src.date ?? todayISO(),
    // Transaksi lama tanpa jam tidak diberi jam "sekarang" hanya karena dibuka untuk diubah.
    time: editing ? editing.time ?? '' : src.time ?? nowTime(),
    accountId: src.accountId ?? (editing ? '' : type === 'receivable_writeoff' ? '' : lastWallet(type)),
    toAccountId: src.toAccountId ?? '',
    categoryId: src.categoryId ?? '',
    refund: isRefund(mode, src.categoryId),
    fee: src.fee ?? null,
    interest: src.interest ?? null,
    contact: src.contact ?? '',
    dueDate: src.dueDate ?? '',
    parentId: src.parentId ?? '',
    counter: src.counter ?? 'wallet',
    description: src.description ?? '',
    note: src.note ?? '',
  };
}

const MODES = [
  { value: 'expense' as const, label: 'Pengeluaran', icon: ArrowUpRight },
  { value: 'income' as const, label: 'Pemasukan', icon: ArrowDownLeft },
  { value: 'transfer' as const, label: 'Transfer', icon: ArrowLeftRight },
  { value: 'payable' as const, label: 'Hutang', icon: Handshake },
  { value: 'receivable' as const, label: 'Piutang', icon: HandCoins },
];

export function TransactionModalHost() {
  const st = useUI((s) => s.tx);
  const close = useUI((s) => s.closeTx);
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (st.open) setKey((k) => k + 1);
  }, [st.open, st.editing, st.defaults]);
  const isJournal = st.editing?.type === 'journal' || st.defaults?.type === 'journal';
  if (isJournal) return <JournalModal key={key} open={st.open} onClose={close} editing={st.editing} defaults={st.defaults} />;
  return <TransactionModal key={key} open={st.open} onClose={close} editing={st.editing} defaults={st.defaults} />;
}

function TransactionModal({
  open,
  onClose,
  editing,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  editing?: Transaction;
  defaults?: Partial<Transaction>;
}) {
  const data = useData((s) => s.data);
  const uiMode = usePrefs((s) => s.mode);
  const [d, setD] = useState<Draft>(() => initDraft(editing, defaults));
  const [tried, setTried] = useState(false);
  const [showNote, setShowNote] = useState(!!editing?.note);
  const [showJournal, setShowJournal] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const type = typeOf(d.mode, d.sub);
  // Kunci periode: transaksi di periode yang ditutup hanya bisa dilihat; tanggal baru tidak boleh masuk ke sana.
  const lockDate = data.profile.lockDate;
  const lockedEdit = !!editing && isLocked(editing.date, lockDate);
  const minDate = lockDate && !lockedEdit ? addDays(lockDate, 1) : undefined;

  const wallets = useWalletOptions();
  const expenseCats = useCategoryOptions('expense');
  const revenueCats = useCategoryOptions('revenue');
  const contacts = useContacts();
  const payables = useOpenDebtOptions('payable', editing?.parentId);
  const receivables = useOpenDebtOptions('receivable', editing?.parentId);

  // Refund membalik jenis kategorinya: pemasukan → kategori beban, pengeluaran → kategori pendapatan.
  const incomeSide = d.mode === 'income' ? !d.refund : d.mode === 'expense' ? d.refund : d.mode === 'receivable' && d.counter === 'category';
  const cats = incomeSide ? revenueCats : expenseCats;

  // kategori yang sering dipakai (90 hari)
  const frequent = useMemo(() => {
    const kind = d.mode === 'income' ? 'income' : 'expense';
    const since = addDays(todayISO(), -90);
    const m = new Map<string, number>();
    for (const t of data.transactions) if (t.type === kind && t.categoryId && t.date >= since) m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + 1);
    // riwayat masih sedikit → lengkapi dengan kategori yang umum dipakai
    const defaults = kind === 'income'
      ? ['acc-salary', 'acc-bonus', 'acc-freelance', 'acc-business', 'acc-investment-income', 'acc-gift-income']
      : ['acc-food', 'acc-transport', 'acc-groceries', 'acc-housing', 'acc-utilities', 'acc-subscription'];
    const ids = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    for (const id of defaults) if (ids.length < 6 && !ids.includes(id)) ids.push(id);
    return ids
      .slice(0, 6)
      .map((id) => data.accounts.find((a) => a.id === id))
      .filter((a): a is NonNullable<typeof a> => !!a && !a.archived);
  }, [data, d.mode]);

  // saran keterangan: dari riwayat, sekaligus mengisi kategori & akun
  const descSuggestions = useMemo(() => {
    const m = new Map<string, { n: number; tx: Transaction }>();
    for (const t of data.transactions) {
      if (t.type !== type || !t.description) continue;
      const k = t.description.trim();
      const e = m.get(k);
      if (e) {
        e.n++;
        if (t.createdAt > e.tx.createdAt) e.tx = t;
      } else m.set(k, { n: 1, tx: t });
    }
    return [...m.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 300)
      .map(([v, e]) => ({
        value: v,
        meta: data.accounts.find((a) => a.id === e.tx.categoryId)?.name ?? (e.tx.amount ? formatMoney(e.tx.amount, { compact: true }) : undefined),
        tx: e.tx,
      }));
  }, [data, type]);

  const debt = useMemo(() => {
    if (!d.parentId) return null;
    return debtInfos(data, '9999-12-31').find((x) => x.tx.id === d.parentId) ?? null;
  }, [data, d.parentId]);
  // total pembayaran + hapus buku atas hutang/piutang yang sedang diubah (untuk validasi pokok)
  const { editingSettled, firstPayment } = useMemo(() => {
    if (!editing || (editing.type !== 'payable_new' && editing.type !== 'receivable_new')) return { editingSettled: 0, firstPayment: '' };
    const info = debtInfos(data, '9999-12-31').find((x) => x.tx.id === editing.id);
    return { editingSettled: info ? round2(info.paid + info.writtenOff) : 0, firstPayment: info?.payments[0]?.date ?? '' };
  }, [data, editing]);
  // sisa hutang tidak termasuk transaksi yang sedang diubah
  const remainingForEdit = debt ? round2(debt.remaining + (editing && editing.parentId === debt.tx.id ? editing.amount : 0)) : 0;

  // isi otomatis nominal saat memilih hutang/piutang
  const pickDebt = (id: string) => {
    const info = debtInfos(getData(), '9999-12-31').find((x) => x.tx.id === id);
    setD((p) => ({ ...p, parentId: id, amount: p.amount && p.amount > 0 ? p.amount : info ? info.remaining : p.amount }));
  };

  const errors = useMemo(() => {
    const e: Partial<Record<keyof Draft, string>> = {};
    const needsParent = (d.mode === 'payable' && d.sub === 'pay') || (d.mode === 'receivable' && d.sub !== 'new');
    if (needsParent && !d.parentId) e.parentId = d.mode === 'payable' ? 'Pilih hutang yang dibayar' : 'Pilih piutang';
    if (d.mode === 'opening') {
      // saldo awal boleh negatif (mis. rekening cerukan), asal tidak nol
      if (!d.amount) e.amount = 'Masukkan saldo awal';
    } else if (!d.amount || d.amount <= 0) {
      if (!(d.mode === 'transfer' && (d.fee ?? 0) > 0) && !((d.sub === 'pay' || d.sub === 'collect') && (d.interest ?? 0) > 0))
        e.amount = 'Masukkan nominal';
    }
    if (needsParent && debt && d.date && d.date < debt.tx.date)
      e.date = `Sebelum ${d.mode === 'payable' ? 'hutang' : 'piutang'} dicatat (${formatDate(debt.tx.date)})`;
    if (editing && d.sub === 'new' && (d.mode === 'payable' || d.mode === 'receivable') && editingSettled > 0 && (d.amount ?? 0) + 0.005 < editingSettled)
      e.amount = `Tidak boleh di bawah jumlah yang sudah dibayar/dihapus (${formatMoney(editingSettled)})`;
    if (editing && d.sub === 'new' && firstPayment && d.date > firstPayment)
      e.date = `Setelah pembayaran pertama (${formatDate(firstPayment)})`;
    if (needsParent && debt && d.amount && d.amount - remainingForEdit > 0.005)
      e.amount = `Melebihi sisa ${d.mode === 'payable' ? 'hutang' : 'piutang'} (${formatMoney(remainingForEdit)})`;
    if (d.mode === 'expense' || d.mode === 'income') {
      if (!d.categoryId) e.categoryId = 'Pilih kategori';
      if (!d.accountId) e.accountId = 'Pilih akun';
    }
    if (d.mode === 'transfer') {
      if (!d.accountId) e.accountId = 'Pilih akun asal';
      if (!d.toAccountId) e.toAccountId = 'Pilih akun tujuan';
      else if (d.toAccountId === d.accountId) e.toAccountId = 'Akun tujuan harus berbeda';
    }
    if ((d.mode === 'payable' || d.mode === 'receivable') && d.sub === 'new') {
      if (!d.contact.trim()) e.contact = d.mode === 'payable' ? 'Isi nama pemberi pinjaman' : 'Isi nama peminjam';
      if (d.counter === 'wallet' && !d.accountId) e.accountId = 'Pilih akun';
      if (d.counter === 'category' && !d.categoryId) e.categoryId = 'Pilih kategori';
      if (d.dueDate && d.dueDate < d.date) e.dueDate = 'Jatuh tempo sebelum tanggal transaksi';
    }
    if ((d.sub === 'pay' || d.sub === 'collect') && !d.accountId) e.accountId = 'Pilih akun';
    if (d.mode === 'opening' && !d.accountId) e.accountId = 'Pilih akun';
    if (!d.date) e.date = 'Pilih tanggal';
    else if (!lockedEdit && isLocked(d.date, lockDate)) e.date = `Periode sampai ${formatDate(lockDate!)} sudah dikunci`;
    return e;
  }, [d, debt, remainingForEdit, editing, editingSettled, firstPayment, lockDate, lockedEdit]);

  const hasErrors = Object.keys(errors).length > 0;
  // Hutang/piutang yang sudah punya pembayaran tidak boleh berganti jenis (pembayarannya akan yatim).
  const lockedType = !!editing && (editing.type === 'payable_new' || editing.type === 'receivable_new') && childCount([editing.id]) > 0;
  const err = (k: keyof Draft) => (tried ? errors[k] : undefined);

  const buildTx = (): Omit<Transaction, 'id' | 'ref' | 'createdAt' | 'updatedAt'> => {
    const base = {
      type,
      date: d.date,
      time: d.time || undefined,
      amount: d.amount ?? 0,
      description: d.description.trim(),
      note: d.note.trim() || undefined,
      accountId: undefined as string | undefined,
      toAccountId: undefined as string | undefined,
      categoryId: undefined as string | undefined,
      fee: undefined as number | undefined,
      interest: undefined as number | undefined,
      contact: undefined as string | undefined,
      dueDate: undefined as string | undefined,
      parentId: undefined as string | undefined,
      counter: undefined as DebtCounter | undefined,
      lines: undefined,
      adjusting: undefined,
    };
    switch (type) {
      case 'expense':
      case 'income':
        return { ...base, accountId: d.accountId, categoryId: d.categoryId };
      case 'transfer':
        return { ...base, accountId: d.accountId, toAccountId: d.toAccountId, fee: d.fee || undefined };
      case 'payable_new':
      case 'receivable_new':
        return {
          ...base,
          contact: d.contact.trim(),
          counter: d.counter,
          dueDate: d.dueDate || undefined,
          accountId: d.counter === 'wallet' ? d.accountId : undefined,
          categoryId: d.counter === 'category' ? d.categoryId : undefined,
        };
      case 'payable_pay':
      case 'receivable_collect':
        return { ...base, parentId: d.parentId, accountId: d.accountId, interest: d.interest || undefined };
      case 'receivable_writeoff':
        return { ...base, parentId: d.parentId };
      case 'opening':
        return { ...base, accountId: d.accountId };
      default:
        return base;
    }
  };

  const preview = useMemo(() => {
    const draft = { ...buildTx(), id: '__draft', ref: editing?.ref ?? 'BARU', createdAt: 0, updatedAt: 0 } as Transaction;
    const ctx = makeCtx(data);
    return journalizeTx(draft, ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, data]);

  // Peringatan lunak: saldo dompet (kas/bank/e-wallet/investasi) menjadi negatif setelah transaksi ini.
  const balanceWarn = useMemo(() => {
    if (!preview) return null;
    const b = getBooks(data);
    const m = balancesAt(b, '9999-12-31');
    const orig = editing ? journalizeTx(editing, makeCtx(data)) : null;
    const effect = (lines: { accountId: string; debit: number; credit: number }[] | undefined, id: string) =>
      (lines ?? []).reduce((s, l) => s + (l.accountId === id ? l.debit - l.credit : 0), 0);
    for (const id of new Set(preview.lines.filter((l) => l.credit > 0).map((l) => l.accountId))) {
      const acc = b.acc.get(id);
      if (!acc || !['cash', 'bank', 'ewallet', 'investment'].includes(acc.subtype)) continue;
      const delta = effect(preview.lines, id) - effect(orig?.lines, id);
      if (delta >= -0.004) continue;
      const after = round2(bal(acc, m) + delta);
      if (after < -0.004) return { name: acc.name, after };
    }
    return null;
  }, [preview, data, editing]);

  // Peringatan lunak: transaksi baru yang isiannya sama persis dengan transaksi di tanggal yang sama.
  const duplicate = useMemo(() => {
    if (editing || !d.amount || !d.date) return null;
    const x = buildTx();
    return (
      data.transactions.find(
        (t) =>
          t.type === x.type &&
          t.date === x.date &&
          Math.abs((t.amount || 0) - (x.amount || 0)) < 0.005 &&
          (t.accountId ?? '') === (x.accountId ?? '') &&
          (t.toAccountId ?? '') === (x.toAccountId ?? '') &&
          (t.categoryId ?? '') === (x.categoryId ?? '') &&
          (t.parentId ?? '') === (x.parentId ?? ''),
      ) ?? null
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, data, editing]);

  // Transaksi favorit: pengeluaran, pemasukan, atau transfer yang bisa dicatat ulang sekali klik
  const canFavorite = (d.mode === 'expense' || d.mode === 'income' || d.mode === 'transfer') && !!(d.accountId || d.categoryId);
  const favExists = useMemo(
    () =>
      data.templates.some(
        (t) =>
          t.type === type &&
          (t.accountId ?? '') === d.accountId &&
          (t.categoryId ?? '') === (type === 'transfer' ? '' : d.categoryId) &&
          (t.toAccountId ?? '') === (type === 'transfer' ? d.toAccountId : '') &&
          (t.amount ?? 0) === (d.amount ?? 0) &&
          (t.description ?? '') === d.description.trim(),
      ),
    [data.templates, type, d],
  );
  const saveFavorite = () => {
    if (!canFavorite || favExists) return;
    const acc = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? '';
    const name =
      d.description.trim() ||
      (type === 'transfer' ? `${acc(d.accountId)} → ${acc(d.toAccountId)}` : acc(d.categoryId)) ||
      (type === 'income' ? 'Pemasukan' : 'Pengeluaran');
    const { template, historyId } = addTemplate({
      name: name.slice(0, 40),
      type: type as 'expense' | 'income' | 'transfer',
      amount: d.amount && d.amount > 0 ? d.amount : undefined,
      accountId: d.accountId || undefined,
      toAccountId: type === 'transfer' ? d.toAccountId || undefined : undefined,
      categoryId: type === 'transfer' ? undefined : d.categoryId || undefined,
      description: d.description.trim() || undefined,
    });
    notify(`${template.name} disimpan ke favorit`, historyId, { detail: 'Catat ulang dari tombol Catat atau widget Favorit' });
  };

  const submit = (then: 'close' | 'new') => {
    if (lockedEdit) return;
    setTried(true);
    if (hasErrors) {
      const first = formRef.current?.querySelector<HTMLElement>('.invalid input, .invalid, [aria-invalid="true"]');
      first?.focus();
      return;
    }
    const tx = buildTx();
    const label = TX_META[type].label;
    const amt = formatMoney((tx.amount || 0) + (tx.fee || 0) + (tx.interest || 0));
    // id riwayat kosong = ditolak kunci periode; formulir tetap terbuka agar isian tidak hilang.
    if (editing) {
      const hid = updateTransaction(editing.id, tx as Partial<Transaction>, `Ubah ${label.toLowerCase()}`);
      if (!hid) return;
      notify(`${label} ${amt} diperbarui`, hid);
    } else {
      const { tx: saved, historyId } = addTransaction(tx, `Tambah ${label.toLowerCase()}`);
      if (!historyId) return;
      notify(`${label} ${amt} dicatat`, historyId, { detail: saved.ref });
    }
    if (then === 'new' && !editing) {
      setD((p) => ({ ...p, amount: null, description: '', note: '', fee: null, interest: null, parentId: '', contact: '', dueDate: '', time: nowTime() }));
      setTried(false);
      requestAnimationFrame(() => amountRef.current?.focus());
    } else onClose();
  };

  const remove = async () => {
    if (!editing) return;
    const kids = childCount([editing.id]);
    const ok = await confirm({
      title: 'Hapus transaksi ini?',
      message: kids
        ? `Transaksi ${editing.ref} beserta ${kids} pembayaran terkait akan dihapus. Anda dapat mengurungkannya.`
        : `Transaksi ${editing.ref} akan dihapus dari buku. Anda dapat mengurungkannya.`,
      confirmLabel: 'Hapus',
      tone: 'danger',
    });
    if (!ok) return;
    const hid = deleteTransactions([editing.id]);
    if (!hid) return;
    notify('Transaksi dihapus', hid, { tone: 'danger' });
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit(e.shiftKey ? 'new' : 'close');
      return;
    }
    if (e.altKey && /^Digit[1-5]$/.test(e.code) && !lockedType && d.mode !== 'opening') {
      e.preventDefault();
      const m = MODES[Number(e.code.slice(5)) - 1];
      if (m) switchMode(m.value);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT') {
        e.preventDefault();
        if (!focusNext(t)) submit('close');
      }
    }
  };

  const switchMode = (m: Mode) => {
    setD((p) => {
      const sub: Sub = 'new';
      const nt = typeOf(m, sub);
      return {
        ...p,
        mode: m,
        sub,
        categoryId: '',
        refund: false,
        parentId: '',
        counter: 'wallet',
        accountId: p.accountId || lastWallet(nt),
        toAccountId: m === 'transfer' ? p.toAccountId : '',
      };
    });
    setTried(false);
    requestAnimationFrame(() => amountRef.current?.focus());
  };

  const switchSub = (s: Sub) => {
    setD((p) => ({ ...p, sub: s, parentId: '', amount: s === p.sub ? p.amount : null, counter: 'wallet', accountId: s === 'writeoff' ? '' : p.accountId || lastWallet(typeOf(p.mode, s)) }));
    setTried(false);
  };

  const modeTone = d.mode === 'income' || d.sub === 'collect' ? 'pos' : undefined;
  const title = editing ? `Ubah ${TX_META[editing.type].label}` : 'Catat Transaksi';

  const walletLabel =
    d.mode === 'income' || d.sub === 'collect'
      ? 'Masuk ke akun'
      : d.mode === 'transfer'
        ? 'Dari akun'
        : d.mode === 'payable' && d.sub === 'new'
          ? 'Dana diterima di'
          : d.mode === 'receivable' && d.sub === 'new'
            ? 'Dana dikeluarkan dari'
            : d.mode === 'opening'
              ? 'Akun'
              : 'Dibayar dari';

  const debtCard = debt && (
    <motion.div className="debt-mini" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
      <IconTile icon={debt.kind === 'payable' ? 'handshake' : 'hand-coins'} color={debt.status === 'overdue' ? 'var(--neg)' : debt.kind === 'payable' ? 'var(--tone-payable)' : 'var(--tone-receivable)'} size="sm" />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 6 }}>
          <strong className="truncate">{debt.tx.contact}</strong>
          {debt.status === 'overdue' && <Badge tone="neg">Lewat jatuh tempo</Badge>}
          {debt.status === 'due_soon' && <Badge tone="warn">Segera jatuh tempo</Badge>}
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          Pokok {formatMoney(debt.tx.amount)} · Terbayar {formatMoney(debt.paid + debt.writtenOff)}
          {debt.tx.dueDate && ` · JT ${formatDate(debt.tx.dueDate)}`}
        </div>
        <div style={{ marginTop: 6 }}>
          <Progress value={debt.tx.amount ? (debt.paid + debt.writtenOff) / debt.tx.amount : 0} thin label="Porsi terbayar" color={debt.kind === 'payable' ? 'var(--tone-payable)' : 'var(--tone-receivable)'} />
        </div>
      </div>
      <div className="col" style={{ alignItems: 'flex-end' }}>
        <span className="muted" style={{ fontSize: 12 }}>Sisa</span>
        <strong className="num">{formatMoney(remainingForEdit)}</strong>
      </div>
    </motion.div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={
        editing
          ? `${editing.ref} · dibuat ${formatDate(isoFromTs(editing.createdAt))}`
          : uiMode === 'simple'
            ? 'Catat pemasukan, pengeluaran, transfer, atau hutang-piutang'
            : 'Setiap transaksi otomatis dijurnal secara berpasangan'
      }
      size="md"
      initialFocus={editing ? '[data-field]' : 'input[data-field]'}
      headerExtra={
        editing && !lockedEdit ? (
          <Button variant="danger-ghost" size="sm" icon={Trash2} onClick={remove}>
            Hapus
          </Button>
        ) : null
      }
      footer={
        lockedEdit ? (
          <>
            <span className="spacer" />
            <Button variant="primary" onClick={onClose}>
              Tutup
            </Button>
          </>
        ) : (
          <>
            <span className="hint">
              <Kbd>↵</Kbd> berikutnya · <Kbd>{MOD}</Kbd>
              <Kbd>↵</Kbd> simpan
            </span>
            <span className="spacer" />
            {!editing && (
              <Button onClick={() => submit('new')} icon={Plus}>
                Simpan &amp; baru
              </Button>
            )}
            <Button variant="primary" onClick={() => submit('close')}>
              {editing ? 'Simpan perubahan' : 'Simpan'}
            </Button>
          </>
        )
      }
    >
      {lockedEdit && (
        <div className="lock-note" role="status">
          <Lock aria-hidden />
          <span>
            Periode sampai <strong>{formatDate(lockDate!, 'long')}</strong> sudah dikunci, jadi transaksi ini hanya dapat dilihat. Buka kunci di Pengaturan › Profil &amp; buku untuk mengubahnya.
          </span>
        </div>
      )}
      <div ref={formRef} data-form onKeyDown={onKey} className={`tx-form${lockedEdit ? ' is-locked' : ''}`} inert={lockedEdit || undefined}>
        {d.mode !== 'opening' && !lockedType && (
          <Segmented value={d.mode} onChange={switchMode} options={MODES} block ariaLabel="Jenis transaksi" className="tx-modes" />
        )}
        {lockedType && (
          <div className="tx-locked muted">
            <CircleAlert size={14} /> Jenis tidak dapat diubah karena {d.mode === 'payable' ? 'hutang' : 'piutang'} ini sudah memiliki pembayaran.
          </div>
        )}

        <AnimatePresence initial={false} mode="popLayout">
          {(d.mode === 'payable' || d.mode === 'receivable') && !lockedType && (
            <motion.div key={d.mode} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
              <div style={{ paddingTop: 10 }}>
                {d.mode === 'payable' ? (
                  <Segmented
                    size="sm"
                    value={d.sub}
                    onChange={switchSub}
                    options={[
                      { value: 'new', label: 'Hutang baru' },
                      { value: 'pay', label: 'Bayar hutang' },
                    ]}
                  />
                ) : (
                  <Segmented
                    size="sm"
                    value={d.sub}
                    onChange={switchSub}
                    options={[
                      { value: 'new', label: 'Piutang baru' },
                      { value: 'collect', label: 'Terima pembayaran' },
                      { value: 'writeoff', label: 'Hapus buku' },
                    ]}
                  />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {(d.sub === 'pay' || d.sub === 'collect' || d.sub === 'writeoff') && (
          <div className="stack-sm" style={{ marginTop: 14 }}>
            <Field label={d.mode === 'payable' ? 'Hutang yang dibayar' : 'Piutang'} error={err('parentId')}>
              <Select
                value={d.parentId}
                onChange={pickDebt}
                options={d.mode === 'payable' ? payables : receivables}
                placeholder={d.mode === 'payable' ? 'Pilih hutang aktif…' : 'Pilih piutang aktif…'}
                invalid={!!err('parentId')}
                emptyText={d.mode === 'payable' ? 'Tidak ada hutang aktif' : 'Tidak ada piutang aktif'}
                searchable
                advance
              />
            </Field>
            {debtCard}
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <Field error={err('amount')}>
            <AmountInput
              ref={amountRef}
              value={d.amount}
              onChange={(v) => set('amount', v)}
              invalid={!!err('amount')}
              tone={modeTone}
              autoFocus={!editing && !(d.sub === 'pay' || d.sub === 'collect' || d.sub === 'writeoff')}
              ariaLabel={d.mode === 'opening' ? 'Saldo awal' : 'Nominal'}
              allowNegative={d.mode === 'opening'}
            />
          </Field>
          {(d.mode === 'expense' || d.mode === 'income') && !d.refund && frequent.length > 0 && (
            <div className="quick-cats">
              {frequent.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="chip"
                  aria-pressed={d.categoryId === a.id}
                  onClick={() => set('categoryId', a.id)}
                  tabIndex={-1}
                  style={{ '--cc': a.color } as React.CSSProperties}
                >
                  <IconTile icon={a.icon} color={a.color} size="xs" round />
                  {a.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="tx-grid">
          {/* Kategori */}
          {(d.mode === 'expense' || d.mode === 'income') && (
            <Field label={d.refund ? (d.mode === 'income' ? 'Kategori beban yang dikembalikan' : 'Kategori pendapatan yang dikembalikan') : 'Kategori'} error={err('categoryId')}>
              <Select value={d.categoryId} onChange={(v) => set('categoryId', v)} options={cats} placeholder="Pilih kategori…" invalid={!!err('categoryId')} searchable advance />
            </Field>
          )}
          {(d.mode === 'expense' || d.mode === 'income') && (
            <Field
              label={d.mode === 'income' ? 'Pengembalian dana (refund)' : 'Pengembalian pendapatan'}
              hint={
                d.mode === 'income'
                  ? 'Aktifkan bila uang kembali dari belanja atau biaya sebelumnya: mengurangi beban, bukan menambah pendapatan.'
                  : 'Aktifkan bila pendapatan dikembalikan (mis. gaji kelebihan bayar): mengurangi pendapatan, bukan menambah beban.'
              }
            >
              <Switch
                checked={d.refund}
                onChange={(v) => setD((p) => ({ ...p, refund: v, categoryId: '' }))}
                label={d.mode === 'income' ? 'Pengembalian dana' : 'Pengembalian pendapatan'}
              />
            </Field>
          )}

          {/* Kontak */}
          {(d.mode === 'payable' || d.mode === 'receivable') && d.sub === 'new' && (
            <Field label={d.mode === 'payable' ? 'Pemberi pinjaman / kreditur' : 'Peminjam / debitur'} error={err('contact')} className="span-2">
              <AutoComplete
                value={d.contact}
                onChange={(v) => set('contact', v)}
                suggestions={contacts.map((c) => ({ value: c }))}
                placeholder="Nama orang atau perusahaan"
                icon={User}
                invalid={!!err('contact')}
              />
            </Field>
          )}

          {(d.mode === 'payable' || d.mode === 'receivable') && d.sub === 'new' && (
            <Field label="Sumber pencatatan" className="span-2">
              <Segmented
                size="sm"
                block
                value={d.counter}
                onChange={(v) => setD((p) => ({ ...p, counter: v, categoryId: '' }))}
                options={
                  d.mode === 'payable'
                    ? [
                        { value: 'wallet', label: 'Uang diterima' },
                        { value: 'category', label: 'Beli secara kredit' },
                        { value: 'opening', label: 'Hutang lama' },
                      ]
                    : [
                        { value: 'wallet', label: 'Uang dipinjamkan' },
                        { value: 'category', label: 'Jual/jasa kredit' },
                        { value: 'opening', label: 'Piutang lama' },
                      ]
                }
              />
            </Field>
          )}

          {(d.mode === 'payable' || d.mode === 'receivable') && d.sub === 'new' && d.counter === 'category' && (
            <Field label={d.mode === 'payable' ? 'Kategori beban' : 'Kategori pendapatan'} error={err('categoryId')}>
              <Select value={d.categoryId} onChange={(v) => set('categoryId', v)} options={cats} placeholder="Pilih kategori…" invalid={!!err('categoryId')} searchable advance />
            </Field>
          )}

          {/* Akun dompet */}
          {!(d.sub === 'writeoff') && !((d.mode === 'payable' || d.mode === 'receivable') && d.sub === 'new' && d.counter !== 'wallet') && (
            <Field label={walletLabel} error={err('accountId')}>
              <Select value={d.accountId} onChange={(v) => set('accountId', v)} options={wallets} placeholder="Pilih akun…" invalid={!!err('accountId')} advance />
            </Field>
          )}

          {d.mode === 'transfer' && (
            <Field label="Ke akun" error={err('toAccountId')}>
              <Select
                value={d.toAccountId}
                onChange={(v) => set('toAccountId', v)}
                options={wallets.map((w) => ({ ...w, disabled: w.value === d.accountId }))}
                placeholder="Pilih akun tujuan…"
                invalid={!!err('toAccountId')}
                advance
              />
            </Field>
          )}

          {d.mode === 'transfer' && (
            <Field label="Biaya admin" optional>
              <AmountInput variant="inline" value={d.fee} onChange={(v) => set('fee', v)} placeholder="0" ariaLabel="Biaya admin" />
            </Field>
          )}

          {(d.sub === 'pay' || d.sub === 'collect') && (
            <Field label={d.sub === 'pay' ? 'Bunga / denda' : 'Bunga / denda diterima'} optional>
              <AmountInput variant="inline" value={d.interest} onChange={(v) => set('interest', v)} placeholder="0" ariaLabel="Bunga" />
            </Field>
          )}

          <Field label="Tanggal" error={err('date')}>
            <DatePicker value={d.date} onChange={(v) => set('date', v)} advance min={minDate} />
          </Field>

          {(d.mode === 'payable' || d.mode === 'receivable') && d.sub === 'new' && (
            <Field label="Jatuh tempo" optional error={err('dueDate')}>
              <DatePicker value={d.dueDate} onChange={(v) => set('dueDate', v)} clearable placeholder="Tanpa jatuh tempo" advance />
            </Field>
          )}

          <Field label="Keterangan" optional className="span-2">
            <AutoComplete
              value={d.description}
              onChange={(v) => set('description', v)}
              suggestions={descSuggestions}
              onPick={(s) => {
                const hit = descSuggestions.find((x) => x.value === s.value)?.tx;
                if (hit) setD((p) => ({ ...p, categoryId: p.categoryId || hit.categoryId || '', accountId: p.accountId || hit.accountId || '' }));
              }}
              placeholder={
                d.mode === 'expense' ? 'mis. Makan siang bersama tim' : d.mode === 'income' ? 'mis. Gaji bulan ini' : 'Tambahkan keterangan'
              }
              icon={Text}
            />
          </Field>
        </div>

        {balanceWarn && (
          <div className="tx-warn" role="status">
            <TriangleAlert aria-hidden />
            <span>
              Saldo {balanceWarn.name} akan menjadi <strong className="money-val">{formatMoney(balanceWarn.after)}</strong> setelah transaksi ini. Periksa akun atau isi saldo awalnya.
            </span>
          </div>
        )}
        {duplicate && (
          <div className="tx-warn info" role="status">
            <Copy aria-hidden />
            <span>
              Transaksi serupa sudah tercatat: <strong>{duplicate.ref}</strong>
              {duplicate.description ? ` · ${duplicate.description}` : ''}. Pastikan ini bukan catatan ganda.
            </span>
          </div>
        )}

        <div className="tx-extras">
          {!showNote ? (
            <button type="button" className="link-btn" onClick={() => setShowNote(true)}>
              <Plus size={14} /> Tambah catatan
            </button>
          ) : (
            <div style={{ width: '100%' }}>
              <TextArea value={d.note} onChange={(v) => set('note', v)} placeholder="Catatan tambahan (tidak tampil di laporan)" rows={2} autoFocus={!editing?.note} />
            </div>
          )}
          {canFavorite && !showNote && (
            <button
              type="button"
              className="link-btn fav-link"
              onClick={saveFavorite}
              disabled={favExists}
              title={favExists ? 'Transaksi dengan isian yang sama sudah ada di favorit' : 'Simpan isian ini agar bisa dicatat ulang dengan sekali klik'}
            >
              {favExists ? <Check size={14} /> : <Star size={14} />}
              {favExists ? 'Ada di favorit' : 'Simpan ke favorit'}
            </button>
          )}
        </div>

        {/* Pratinjau jurnal (disembunyikan pada mode Sederhana) */}
        {uiMode !== 'simple' && (
        <div className={`jpreview${showJournal ? ' open' : ''}`}>
          <button type="button" className="jp-head" onClick={() => setShowJournal((v) => !v)} aria-expanded={showJournal}>
            <NotebookPen size={15} />
            <span>Jurnal otomatis</span>
            {preview ? (
              <Badge tone="pos" icon={CircleCheck}>
                Seimbang
              </Badge>
            ) : (
              <Badge icon={CircleAlert}>Belum lengkap</Badge>
            )}
            <ChevronDown size={15} className="jp-chev" />
          </button>
          <AnimatePresence initial={false}>
            {showJournal && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                <div className="jp-body">
                  {preview ? (
                    <table className="jp-table">
                      <thead>
                        <tr>
                          <th>Akun</th>
                          <th className="r">Debit</th>
                          <th className="r">Kredit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.lines.map((l, i) => {
                          const a = data.accounts.find((x) => x.id === l.accountId);
                          return (
                            <tr key={i}>
                              <td style={{ paddingLeft: l.credit ? 26 : 8 }}>
                                <span className="code">{a?.code}</span> {a?.name}
                              </td>
                              <td className="r num">{l.debit ? formatMoney(l.debit, { symbol: false }) : ''}</td>
                              <td className="r num">{l.credit ? formatMoney(l.credit, { symbol: false }) : ''}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div className="muted" style={{ fontSize: 13, padding: '6px 8px' }}>
                      Lengkapi nominal dan akun untuk melihat jurnal.
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        )}

        {(d.mode === 'payable' || d.mode === 'receivable') && d.sub === 'new' && d.dueDate && d.date && d.dueDate >= d.date && (
          <div className="muted" style={{ fontSize: 12, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CalendarClock size={13} /> Tenor {daysBetween(d.date, d.dueDate)} hari · jatuh tempo {formatDate(d.dueDate, 'long')}
          </div>
        )}
      </div>
    </Modal>
  );
}
