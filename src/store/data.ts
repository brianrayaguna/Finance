import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { defaultAccounts, nextCode, SUBTYPE_META, SYS, SYSTEM_IDS } from '../accounting/coa';
import { nextRef, refPrefix, TX_META } from '../accounting/engine';
import type {
  Account,
  AccountSubtype,
  AppData,
  Budget,
  FixedAsset,
  Goal,
  Profile,
  Transaction,
  TxTemplate,
} from '../accounting/types';
import { lockViolations } from '../accounting/lock';
import { formatDate, round2, todayISO, uid } from '../lib/format';
import { remapColor, remapIcon } from '../lib/icons';
import { toast } from './ui';

export function emptyData(): AppData {
  return {
    version: 1,
    profile: {
      name: '',
      entityName: '',
      fiscalYearStartMonth: 1,
      onboarded: true,
      createdAt: Date.now(),
    },
    accounts: defaultAccounts(),
    transactions: [],
    budgets: [],
    assets: [],
    goals: [],
    templates: [],
  };
}

/**
 * Menyelaraskan data lama/cadangan dengan versi terkini:
 * akun sistem yang hilang ditambahkan, warna & ikon bawaan lama dipetakan ke palet baru.
 */
export function normalizeData(input: AppData): AppData {
  const base = emptyData();
  const d = (input ?? {}) as Partial<AppData>;
  const list = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]).filter((v) => !!v && typeof v === 'object') : []);
  const num = (x: unknown, fallback = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : fallback);
  const isDate = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
  /** Buang duplikat berdasarkan kunci; `last` = entri terakhir yang dipakai (mis. anggaran terbaru). */
  const uniqBy = <T,>(arr: T[], key: (t: T) => string, keep: 'first' | 'last' = 'first') => {
    const m = new Map<string, T>();
    for (const t of arr) if (keep === 'last' || !m.has(key(t))) m.set(key(t), t);
    return [...m.values()];
  };
  const seeds = new Map(defaultAccounts().map((a) => [a.id, a]));

  // Akun: jenis tak dikenal dipulihkan, tipe diselaraskan dengan subjenis, akun sistem dilindungi.
  const accounts: Account[] = uniqBy(
    list<Account>(d.accounts).filter((a) => typeof a.id === 'string' && a.id),
    (a) => a.id,
  ).map((a) => {
    const seed = seeds.get(a.id);
    const subtype = SUBTYPE_META[a.subtype] ? a.subtype : seed?.subtype ?? fallbackSubtype(a.type);
    return {
      ...a,
      subtype,
      type: SUBTYPE_META[subtype].type,
      name: String(a.name ?? '').trim() || seed?.name || 'Akun tanpa nama',
      code: String(a.code ?? '').trim() || seed?.code || '',
      system: SYSTEM_IDS.has(a.id) || !!a.system,
      color: remapColor(a.color) ?? a.color ?? '#78736A',
      icon: remapIcon(a.icon) ?? a.icon ?? 'tag',
      createdAt: num(a.createdAt, Date.now()),
    };
  });
  const have = new Set(accounts.map((a) => a.id));
  for (const a of defaultAccounts()) if (a.system && !have.has(a.id)) accounts.push(a);
  for (const a of accounts) if (!a.code) a.code = nextCode(accounts, a.subtype);

  const transactions: Transaction[] = uniqBy(
    list<Transaction>(d.transactions).filter((t) => typeof t.id === 'string' && t.id && t.type in TX_META && isDate(t.date)),
    (t) => t.id,
  ).map((t) => {
    const now = num(t.createdAt, Date.now());
    const x: Transaction = {
      ...t,
      amount: t.type === 'opening' ? round2(num(t.amount)) : round2(Math.abs(num(t.amount))),
      description: typeof t.description === 'string' ? t.description : '',
      ref: typeof t.ref === 'string' && t.ref ? t.ref : '',
      createdAt: now,
      updatedAt: num(t.updatedAt, now),
    };
    if (t.fee !== undefined) x.fee = round2(Math.abs(num(t.fee)));
    if (t.interest !== undefined) x.interest = round2(Math.abs(num(t.interest)));
    if (t.dueDate !== undefined && !isDate(t.dueDate)) delete x.dueDate;
    if (Array.isArray(t.lines))
      x.lines = t.lines
        .filter((l) => l && typeof l.accountId === 'string')
        .map((l) => ({ ...l, debit: round2(Math.abs(num(l.debit))), credit: round2(Math.abs(num(l.credit))) }));
    if (x.type === 'journal') x.amount = journalAmount(x.lines);
    return x;
  });
  // nomor bukti yang hilang dibuat ulang berurutan
  for (const t of transactions) if (!t.ref) t.ref = nextRef(transactions, refPrefix(t), t.date);

  const budgets: Budget[] = uniqBy(
    list<Budget>(d.budgets).filter((b) => typeof b.categoryId === 'string' && num(b.amount) > 0),
    (b) => b.categoryId,
    'last',
  ).map((b) => ({ ...b, id: b.id || uid('bg'), amount: round2(num(b.amount)), createdAt: num(b.createdAt, Date.now()) }));

  const assets: FixedAsset[] = uniqBy(
    list<FixedAsset>(d.assets).filter((a) => typeof a.id === 'string' && a.id && isDate(a.acquisitionDate) && typeof a.accountId === 'string'),
    (a) => a.id,
  ).map((a) => ({
    ...a,
    name: String(a.name ?? '').trim() || 'Aset',
    cost: round2(Math.abs(num(a.cost))),
    residualValue: round2(Math.abs(num(a.residualValue))),
    usefulLifeMonths: Math.max(1, Math.round(num(a.usefulLifeMonths, 12))),
    method: a.method === 'declining_balance' ? 'declining_balance' : 'straight_line',
    depreciable: a.depreciable === false ? false : undefined,
    funding: a.funding === 'opening' ? 'opening' : 'wallet',
    ref: a.ref || nextRef(list<FixedAsset>(d.assets), 'AST', a.acquisitionDate),
    createdAt: num(a.createdAt, Date.now()),
    disposal: a.disposal && isDate(a.disposal.date) ? { ...a.disposal, proceeds: round2(Math.abs(num(a.disposal.proceeds))) } : undefined,
  }));

  const accountIds = new Set(accounts.map((a) => a.id));
  const goals: Goal[] = uniqBy(
    list<Goal>(d.goals).filter((g) => typeof g.id === 'string' && g.id && num(g.target) > 0),
    (g) => g.id,
  ).map((g) => ({
    ...g,
    name: String(g.name ?? '').trim() || 'Target tabungan',
    target: round2(num(g.target)),
    targetDate: isDate(g.targetDate) ? g.targetDate : undefined,
    accountIds: Array.isArray(g.accountIds) ? [...new Set(g.accountIds.filter((id) => typeof id === 'string' && accountIds.has(id)))] : [],
    icon: typeof g.icon === 'string' ? g.icon : 'piggy-bank',
    color: typeof g.color === 'string' ? g.color : '#2E7F80',
    createdAt: num(g.createdAt, Date.now()),
  }));
  const templates: TxTemplate[] = uniqBy(
    list<TxTemplate>(d.templates).filter((t) => typeof t.id === 'string' && t.id && ['expense', 'income', 'transfer'].includes(t.type)),
    (t) => t.id,
  ).map((t) => {
    const x: TxTemplate = { ...t, name: String(t.name ?? '').trim() || 'Favorit', createdAt: num(t.createdAt, Date.now()) };
    if (t.amount !== undefined) {
      const a = round2(Math.abs(num(t.amount)));
      if (a > 0) x.amount = a;
      else delete x.amount;
    }
    for (const k of ['accountId', 'toAccountId', 'categoryId'] as const) if (x[k] && !accountIds.has(x[k]!)) delete x[k];
    return x;
  });

  const p = (d.profile ?? {}) as Partial<Profile>;
  const fy = Math.round(num(p.fiscalYearStartMonth, 1));
  const profile: Profile = {
    ...base.profile,
    ...p,
    name: typeof p.name === 'string' ? p.name : '',
    entityName: typeof p.entityName === 'string' ? p.entityName : '',
    fiscalYearStartMonth: fy >= 1 && fy <= 12 ? fy : 1,
    onboarded: true,
  };
  if (!isDate(profile.lockDate)) delete profile.lockDate;
  const seq: Record<string, number> = {};
  if (p.refSeq && typeof p.refSeq === 'object')
    for (const [k, v] of Object.entries(p.refSeq)) if (typeof v === 'number' && Number.isFinite(v) && v > 0) seq[k] = Math.floor(v);
  if (Object.keys(seq).length) profile.refSeq = seq;
  else delete profile.refSeq;
  return {
    version: 1,
    profile,
    accounts,
    transactions,
    budgets,
    assets,
    goals,
    templates,
  };
}

function fallbackSubtype(type: unknown): AccountSubtype {
  switch (type) {
    case 'liability':
      return 'other_current_liability';
    case 'equity':
      return 'capital';
    case 'revenue':
      return 'other_revenue';
    case 'expense':
      return 'other_expense';
    default:
      return 'other_current_asset';
  }
}

interface Snapshot {
  id: string;
  label: string;
  data: AppData;
}

interface CommitOpts {
  /** Lewati kunci periode — hanya untuk penggantian data menyeluruh (pulihkan cadangan, atur ulang). */
  force?: boolean;
}

interface DataState {
  data: AppData;
  past: Snapshot[];
  future: Snapshot[];
  lastId: string | null;
  /** Mengembalikan id riwayat; string kosong berarti perubahan ditolak (periode terkunci). */
  commit: (label: string, fn: (d: AppData) => AppData, opts?: CommitOpts) => string;
  undo: () => string | null;
  redo: () => string | null;
  canUndoId: (id: string) => boolean;
}

const HISTORY = 80;

const safeStorage = createJSONStorage(() => {
  try {
    const k = '__keuanganku_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    const mem = new Map<string, string>();
    return {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    } as Storage;
  }
});

export const useData = create<DataState>()(
  persist(
    (set, get) => ({
      data: emptyData(),
      past: [],
      future: [],
      lastId: null,
      commit: (label, fn, opts) => {
        const id = uid('h');
        const prev = get().data;
        const next = fn(prev);
        if (next === prev) return id;
        // Satu pintu untuk semua perubahan: periode yang sudah ditutup tidak bisa berubah dari formulir mana pun.
        const blocked = opts?.force ? [] : lockViolations(prev, next);
        if (blocked.length) {
          const lock = formatDate(prev.profile.lockDate ?? '', 'long');
          const refs = [...new Set(blocked.map((v) => v.ref).filter(Boolean))];
          toast(`Periode sampai ${lock} sudah dikunci`, {
            tone: 'danger',
            detail: `${refs.slice(0, 2).join(', ')}${refs.length > 2 ? ` dan ${refs.length - 2} lainnya` : ''} tidak dapat diubah. Buka kunci di Pengaturan › Profil & buku.`,
            duration: 6000,
          });
          return '';
        }
        set((s) => ({
          data: next,
          past: [...s.past, { id, label, data: prev }].slice(-HISTORY),
          future: [],
          lastId: id,
        }));
        return id;
      },
      undo: () => {
        const { past, data, future } = get();
        const snap = past[past.length - 1];
        if (!snap) return null;
        set({
          data: snap.data,
          past: past.slice(0, -1),
          future: [{ id: snap.id, label: snap.label, data }, ...future].slice(0, HISTORY),
          lastId: past[past.length - 2]?.id ?? null,
        });
        return snap.label;
      },
      redo: () => {
        const { past, data, future } = get();
        const snap = future[0];
        if (!snap) return null;
        set({
          data: snap.data,
          future: future.slice(1),
          past: [...past, { id: snap.id, label: snap.label, data }].slice(-HISTORY),
          lastId: snap.id,
        });
        return snap.label;
      },
      canUndoId: (id) => get().past[get().past.length - 1]?.id === id,
    }),
    {
      // Nama kunci lama dipertahankan agar data yang sudah tersimpan tetap terbaca.
      name: 'neraca.data',
      version: 1,
      storage: safeStorage,
      partialize: (s) => ({ data: s.data }) as unknown as DataState,
      merge: (persisted, current) => {
        const p = persisted as Partial<DataState> | undefined;
        if (!p?.data) return current;
        return { ...current, data: normalizeData(p.data) };
      },
    },
  ),
);

/* ───────── Actions ───────── */

const commit = (label: string, fn: (d: AppData) => AppData, opts?: CommitOpts) => useData.getState().commit(label, fn, opts);
export const getData = () => useData.getState().data;

export type TxInput = Omit<Transaction, 'id' | 'ref' | 'createdAt' | 'updatedAt'> & { ref?: string };

/**
 * Nomor bukti berikutnya untuk awalan & bulan tertentu. Nomor yang pernah terbit tidak dipakai ulang,
 * walau transaksinya sudah dihapus (jejak audit): urutan dijaga lewat `profile.refSeq`.
 */
function issueRef(d: AppData, prefix: string, date: string, existing: { ref: string }[] = d.transactions) {
  const head = `${prefix}/${date.slice(0, 4)}/${date.slice(5, 7)}`;
  const fromList = Number(nextRef(existing, prefix, date).slice(head.length + 1));
  const n = Math.max(fromList, (d.profile.refSeq?.[head] ?? 0) + 1);
  return { ref: `${head}/${String(n).padStart(4, '0')}`, head, n };
}

const withSeq = (p: Profile, head: string, n: number): Profile => ({ ...p, refSeq: { ...p.refSeq, [head]: Math.max(p.refSeq?.[head] ?? 0, n) } });

/** Nominal jurnal manual = total debit barisnya (selalu diturunkan, tidak pernah diisi tangan). */
export function journalAmount(lines: Transaction['lines']): number {
  return round2((lines ?? []).reduce((s, l) => s + Math.abs(l.debit || 0), 0));
}

function clean(tx: Transaction): Transaction {
  // round2 juga menormalkan NaN/Infinity menjadi 0 sehingga nilai rusak tidak masuk buku.
  const t = { ...tx, amount: round2(Math.abs(tx.amount || 0)) };
  if (t.fee) t.fee = round2(Math.abs(t.fee));
  if (t.interest) t.interest = round2(Math.abs(t.interest));
  if (t.type === 'opening') t.amount = round2(tx.amount || 0);
  if (t.type === 'journal') t.amount = journalAmount(t.lines);
  (Object.keys(t) as (keyof Transaction)[]).forEach((k) => {
    if (t[k] === undefined || t[k] === '') delete t[k];
  });
  return t;
}

export function addTransaction(input: TxInput, label = 'Tambah transaksi'): { tx: Transaction; historyId: string } {
  const now = Date.now();
  const d = getData();
  const issued = input.ref ? null : issueRef(d, refPrefix(input), input.date);
  const tx = clean({
    ...input,
    id: uid('tx'),
    ref: input.ref || issued!.ref,
    createdAt: now,
    updatedAt: now,
  } as Transaction);
  const historyId = commit(label, (s) => ({
    ...s,
    profile: issued ? withSeq(s.profile, issued.head, issued.n) : s.profile,
    transactions: [...s.transactions, tx],
  }));
  return { tx, historyId };
}

export function updateTransaction(id: string, patch: Partial<Transaction>, label = 'Ubah transaksi') {
  return commit(label, (s) => {
    let profile = s.profile;
    const transactions = s.transactions.map((t) => {
      if (t.id !== id) return t;
      const merged = { ...t, ...patch, updatedAt: Date.now() } as Transaction;
      // Nomor bukti tetap walau tanggal pindah bulan (dokumen yang sudah terbit tidak dinomori ulang);
      // nomor baru hanya bila jenis dokumennya berubah (awalan berbeda).
      const pre = refPrefix(merged);
      if (!t.ref.startsWith(`${pre}/`)) {
        const next = issueRef({ ...s, profile }, pre, merged.date, s.transactions.filter((x) => x.id !== id));
        merged.ref = next.ref;
        profile = withSeq(profile, next.head, next.n);
      }
      return clean(merged);
    });
    return { ...s, profile, transactions };
  });
}

/** Menghapus transaksi beserta turunannya (pembayaran hutang/piutang). */
export function deleteTransactions(ids: string[], label?: string) {
  const all = new Set(ids);
  const d = getData();
  for (const t of d.transactions) if (t.parentId && all.has(t.parentId)) all.add(t.id);
  return commit(label ?? (ids.length > 1 ? `Hapus ${ids.length} transaksi` : 'Hapus transaksi'), (s) => ({
    ...s,
    transactions: s.transactions.filter((t) => !all.has(t.id)),
  }));
}

export function childCount(ids: string[]): number {
  const set = new Set(ids);
  return getData().transactions.filter((t) => t.parentId && set.has(t.parentId) && !set.has(t.id)).length;
}

export function duplicateTransaction(id: string, date = todayISO()) {
  const src = getData().transactions.find((t) => t.id === id);
  if (!src) return null;
  const { id: _i, ref: _r, createdAt: _c, updatedAt: _u, ...rest } = src;
  void _i; void _r; void _c; void _u;
  return addTransaction({ ...rest, date }, 'Duplikat transaksi');
}

/* Akun & kategori */

export function addAccount(input: Omit<Account, 'id' | 'code' | 'createdAt'> & { code?: string }, label = 'Tambah akun') {
  const d = getData();
  const acc: Account = {
    ...input,
    id: uid('acc'),
    code: input.code?.trim() || nextCode(d.accounts, input.subtype),
    createdAt: Date.now(),
  };
  const historyId = commit(label, (s) => ({ ...s, accounts: [...s.accounts, acc] }));
  return { account: acc, historyId };
}

export function updateAccount(id: string, patch: Partial<Account>, label = 'Ubah akun') {
  return commit(label, (s) => ({
    ...s,
    accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
  }));
}

export function accountUsage(id: string): number {
  const d = getData();
  let n = 0;
  for (const t of d.transactions) {
    if (t.type === 'opening' && t.accountId === id) continue;
    if (t.accountId === id || t.toAccountId === id || t.categoryId === id || t.debtAccountId === id) n++;
    else if (t.lines?.some((l) => l.accountId === id)) n++;
  }
  for (const a of d.assets) if (a.accountId === id || a.paidFromAccountId === id || a.disposal?.accountId === id) n++;
  if (d.budgets.some((b) => b.categoryId === id)) n++;
  return n;
}

export function deleteAccount(id: string) {
  return commit('Hapus akun', (s) => ({
    ...s,
    accounts: s.accounts.filter((a) => a.id !== id),
    transactions: s.transactions.filter((t) => !(t.type === 'opening' && t.accountId === id)),
    budgets: s.budgets.filter((b) => b.categoryId !== id),
    // tautan target tabungan & favorit ke akun ini ikut dilepas
    goals: s.goals.map((g) => (g.accountIds.includes(id) ? { ...g, accountIds: g.accountIds.filter((x) => x !== id) } : g)),
    templates: s.templates.filter((t) => t.accountId !== id && t.toAccountId !== id && t.categoryId !== id),
  }));
}

/**
 * Mengubah dompet beserta saldo awalnya dalam SATU langkah riwayat, sehingga tombol Urungkan
 * membatalkan keduanya sekaligus. Saldo awal yang tidak berubah tidak menambah riwayat.
 */
export function updateWallet(id: string, patch: Partial<Account>, opening: { amount: number; date: string }, label = 'Ubah dompet') {
  return commit(label, (s) => {
    let profile = s.profile;
    const accounts = s.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a));
    const amount = round2(opening.amount || 0);
    const existing = s.transactions.find((t) => t.type === 'opening' && t.accountId === id);
    let transactions = s.transactions;
    if (existing) {
      if (!amount) transactions = transactions.filter((t) => t.id !== existing.id);
      else if (existing.amount !== amount || existing.date !== opening.date) {
        // nomor bukti saldo awal tidak berubah walau tanggalnya dipindah
        transactions = transactions.map((t) => (t.id === existing.id ? { ...t, amount, date: opening.date, updatedAt: Date.now() } : t));
      }
    } else if (amount) {
      const now = Date.now();
      const next = issueRef(s, 'SA', opening.date);
      profile = withSeq(profile, next.head, next.n);
      transactions = [
        ...transactions,
        { id: uid('tx'), type: 'opening', date: opening.date, amount, accountId: id, description: '', ref: next.ref, createdAt: now, updatedAt: now },
      ];
    }
    return { ...s, profile, accounts, transactions };
  });
}

/** Membuat/memperbarui jurnal saldo awal sebuah dompet. */
export function setOpeningBalance(accountId: string, amount: number, date: string, label = 'Saldo awal') {
  const d = getData();
  const existing = d.transactions.find((t) => t.type === 'opening' && t.accountId === accountId);
  if (existing) {
    if (!amount) return deleteTransactions([existing.id], label);
    return updateTransaction(existing.id, { amount, date }, label);
  }
  if (!amount) return null;
  return addTransaction(
    { type: 'opening', date, amount, accountId, description: '' },
    label,
  ).historyId;
}

export function createWallet(
  input: Omit<Account, 'id' | 'code' | 'createdAt' | 'type'> & { opening?: number; openingDate?: string },
) {
  const { opening, openingDate, ...rest } = input;
  const d = getData();
  const type = rest.subtype === 'credit_card' ? 'liability' : 'asset';
  const acc: Account = { ...rest, type, id: uid('acc'), code: nextCode(d.accounts, rest.subtype), createdAt: Date.now() };
  const now = Date.now();
  const txs: Transaction[] = [];
  let issued: ReturnType<typeof issueRef> | null = null;
  if (opening) {
    const date = openingDate || todayISO();
    issued = issueRef(d, 'SA', date);
    txs.push({
      id: uid('tx'),
      type: 'opening',
      date,
      amount: round2(opening),
      accountId: acc.id,
      description: '',
      ref: issued.ref,
      createdAt: now,
      updatedAt: now,
    });
  }
  const historyId = commit('Tambah dompet', (s) => ({
    ...s,
    profile: issued ? withSeq(s.profile, issued.head, issued.n) : s.profile,
    accounts: [...s.accounts, acc],
    transactions: [...s.transactions, ...txs],
  }));
  return { account: acc, historyId };
}

/* Anggaran */

export function upsertBudget(categoryId: string, amount: number) {
  return commit('Simpan anggaran', (s) => {
    const ex = s.budgets.find((b) => b.categoryId === categoryId);
    if (ex) return { ...s, budgets: s.budgets.map((b) => (b.id === ex.id ? { ...b, amount: round2(amount) } : b)) };
    const nb: Budget = { id: uid('bg'), categoryId, amount: round2(amount), createdAt: Date.now() };
    return { ...s, budgets: [...s.budgets, nb] };
  });
}

export function deleteBudget(id: string) {
  return commit('Hapus anggaran', (s) => ({ ...s, budgets: s.budgets.filter((b) => b.id !== id) }));
}

/* Aset tetap */

export function addAsset(input: Omit<FixedAsset, 'id' | 'ref' | 'createdAt'>) {
  const d = getData();
  const issued = issueRef(d, 'AST', input.acquisitionDate, d.assets);
  const asset: FixedAsset = {
    ...input,
    cost: round2(input.cost),
    residualValue: round2(input.residualValue),
    id: uid('ast'),
    ref: issued.ref,
    createdAt: Date.now(),
  };
  const historyId = commit('Tambah aset tetap', (s) => ({ ...s, profile: withSeq(s.profile, issued.head, issued.n), assets: [...s.assets, asset] }));
  return { asset, historyId };
}

export function updateAsset(id: string, patch: Partial<FixedAsset>, label = 'Ubah aset tetap') {
  return commit(label, (s) => ({ ...s, assets: s.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
}

export function deleteAsset(id: string) {
  return commit('Hapus aset tetap', (s) => ({ ...s, assets: s.assets.filter((a) => a.id !== id) }));
}

/* Target tabungan */

export function addGoal(input: Omit<Goal, 'id' | 'createdAt'>) {
  const goal: Goal = { ...input, target: round2(input.target), id: uid('goal'), createdAt: Date.now() };
  return commit('Tambah target tabungan', (s) => ({ ...s, goals: [...s.goals, goal] }));
}

export function updateGoal(id: string, patch: Partial<Goal>) {
  return commit('Ubah target tabungan', (s) => ({
    ...s,
    goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch, target: round2(patch.target ?? g.target) } : g)),
  }));
}

export function deleteGoal(id: string) {
  return commit('Hapus target tabungan', (s) => ({ ...s, goals: s.goals.filter((g) => g.id !== id) }));
}

/* Transaksi favorit */

export function addTemplate(input: Omit<TxTemplate, 'id' | 'createdAt'>) {
  const t: TxTemplate = { ...input, id: uid('tpl'), createdAt: Date.now() };
  if (t.amount !== undefined && !(t.amount > 0)) delete t.amount;
  else if (t.amount) t.amount = round2(t.amount);
  const historyId = commit('Simpan transaksi favorit', (s) => ({ ...s, templates: [...s.templates, t] }));
  return { template: t, historyId };
}

export function deleteTemplate(id: string) {
  return commit('Hapus transaksi favorit', (s) => ({ ...s, templates: s.templates.filter((t) => t.id !== id) }));
}

/* Profil & data */

export function updateProfile(patch: Partial<Profile>, label = 'Ubah profil') {
  return commit(label, (s) => ({ ...s, profile: { ...s.profile, ...patch } }));
}

export function replaceData(data: AppData, label: string) {
  return commit(label, () => data, { force: true });
}

export function resetAll() {
  return commit('Atur ulang data', () => ({ ...emptyData(), profile: { ...emptyData().profile } }), { force: true });
}

export function isValidData(x: unknown): x is AppData {
  const d = x as AppData;
  return (
    !!d &&
    typeof d === 'object' &&
    Array.isArray(d.accounts) &&
    d.accounts.every((a) => !!a && typeof a === 'object' && typeof a.id === 'string') &&
    Array.isArray(d.transactions) &&
    d.transactions.every((t) => !!t && typeof t === 'object' && typeof t.id === 'string' && typeof t.type === 'string') &&
    !!d.profile &&
    typeof d.profile === 'object'
  );
}

export { SYS };
