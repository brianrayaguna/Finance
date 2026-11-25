import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { defaultAccounts, nextCode, SUBTYPE_META, SYS, SYSTEM_IDS } from '../accounting/coa';
import { nextRef, refPrefix, TX_META } from '../accounting/engine';
import type {
  Account,
  AccountSubtype,
  AppData,
  Budget,
  BudgetKind,
  BudgetTarget,
  FixedAsset,
  Goal,
  Profile,
  PurchaseOrder,
  StockBatch,
  StockCategory,
  StockItem,
  StockLocation,
  StockMove,
  Transaction,
  TxTemplate,
} from '../accounting/types';

export function budgetKind(b: Pick<Budget, 'kind'>): BudgetKind {
  return b.kind === 'debt' ? 'debt' : 'expense';
}

export function budgetTargetKey(b: Pick<Budget, 'kind' | 'categoryId' | 'debtId'>): string {
  if (budgetKind(b) === 'debt') return `debt:${b.debtId || 'all'}`;
  return `expense:${b.categoryId ?? ''}`;
}
import { lockViolations } from '../accounting/lock';
import { DEFAULT_LOCATION_ID, defaultLocations } from '../accounting/stock';
import { formatDate, round2, todayISO, uid } from '../lib/format';
import { remapColor, remapIcon } from '../lib/icons';
import { toast } from './ui';
import { deferStorage } from './deferred';

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
    stockCategories: [],
    stockItems: [],
    stockLocations: defaultLocations(),
    stockMoves: [],
    stockBatches: [],
    purchaseOrders: [],
  };
}

/**
 * Menyelaraskan data tersimpan/cadangan dengan bentuk yang berlaku:
 * akun sistem yang hilang ditambahkan, warna & ikon bawaan dipetakan ke palet kategori.
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
    list<Budget>(d.budgets).filter((b) => {
      if (!(num(b.amount) > 0)) return false;
      if (budgetKind(b) === 'debt') return b.debtId === undefined || b.debtId === '' || typeof b.debtId === 'string';
      return typeof b.categoryId === 'string' && b.categoryId.trim().length > 0;
    }),
    (b) => budgetTargetKey(b),
    'last',
  ).map((b) => {
    const id = b.id || uid('bg');
    const amount = round2(num(b.amount));
    const createdAt = num(b.createdAt, Date.now());
    if (budgetKind(b) === 'debt') {
      const debtId = typeof b.debtId === 'string' && b.debtId.trim() ? b.debtId.trim() : undefined;
      return debtId ? { id, kind: 'debt', debtId, amount, createdAt } : { id, kind: 'debt', amount, createdAt };
    }
    return { id, categoryId: b.categoryId!.trim(), amount, createdAt };
  });

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
    ref: typeof a.ref === 'string' && a.ref ? a.ref : '',
    createdAt: num(a.createdAt, Date.now()),
    disposal: a.disposal && isDate(a.disposal.date) ? { ...a.disposal, proceeds: round2(Math.abs(num(a.disposal.proceeds))) } : undefined,
  }));
  // nomor aset yang hilang dibuat ulang berurutan agar tidak bertabrakan dalam bulan yang sama
  for (const a of assets) if (!a.ref) a.ref = nextRef(assets, 'AST', a.acquisitionDate);

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

  const stockCategories: StockCategory[] = uniqBy(
    list<StockCategory>(d.stockCategories).filter((c) => typeof c.id === 'string' && c.id && typeof c.name === 'string' && c.name.trim()),
    (c) => c.id,
  ).map((c) => ({
    id: c.id,
    name: String(c.name).trim(),
    icon: typeof c.icon === 'string' && c.icon ? remapIcon(c.icon) || c.icon : 'package',
    color: typeof c.color === 'string' && c.color ? remapColor(c.color) || c.color : '#8A6546',
    createdAt: num(c.createdAt, Date.now()),
  }));
  const categoryIds = new Set(stockCategories.map((c) => c.id));

  const stockItems: StockItem[] = uniqBy(
    list<StockItem>(d.stockItems).filter((it) => typeof it.id === 'string' && it.id && typeof it.name === 'string'),
    (it) => it.id,
  ).map((it) => {
    const barcode = String(it.barcode ?? '').trim();
    const brand = String(it.brand ?? '').trim();
    const description = String(it.description ?? '').trim();
    const notes = String(it.notes ?? '').trim();
    const categoryId = typeof it.categoryId === 'string' && categoryIds.has(it.categoryId) ? it.categoryId : undefined;
    const costPrice = it.costPrice !== undefined ? round2(Math.max(0, num(it.costPrice))) : undefined;
    const reorderQty = it.reorderQty !== undefined ? round2(Math.max(0, num(it.reorderQty))) : undefined;
    return {
      ...it,
      sku: String(it.sku ?? '').trim(),
      name: String(it.name ?? '').trim() || 'Barang',
      unit: String(it.unit ?? '').trim() || 'pcs',
      minQty: Math.max(0, round2(num(it.minQty))),
      sellPrice: it.sellPrice !== undefined ? round2(Math.max(0, num(it.sellPrice))) : undefined,
      costPrice: costPrice && costPrice > 0 ? costPrice : undefined,
      barcode: barcode || undefined,
      brand: brand || undefined,
      categoryId,
      reorderQty: reorderQty && reorderQty > 0 ? reorderQty : undefined,
      description: description || undefined,
      notes: notes || undefined,
      inventoryAccountId: typeof it.inventoryAccountId === 'string' && it.inventoryAccountId ? it.inventoryAccountId : SYS.inventory,
      cogsAccountId: typeof it.cogsAccountId === 'string' && it.cogsAccountId ? it.cogsAccountId : undefined,
      revenueAccountId: typeof it.revenueAccountId === 'string' && it.revenueAccountId ? it.revenueAccountId : undefined,
      trackBatch: !!it.trackBatch || undefined,
      archived: !!it.archived || undefined,
      createdAt: num(it.createdAt, Date.now()),
    };
  });

  let stockLocations: StockLocation[] = uniqBy(
    list<StockLocation>(d.stockLocations).filter((l) => typeof l.id === 'string' && l.id),
    (l) => l.id,
  ).map((l) => ({
    ...l,
    name: String(l.name ?? '').trim() || 'Lokasi',
    archived: !!l.archived || undefined,
    createdAt: num(l.createdAt, Date.now()),
  }));
  if (!stockLocations.length) stockLocations = defaultLocations();
  else if (!stockLocations.some((l) => l.id === DEFAULT_LOCATION_ID)) {
    stockLocations = [...defaultLocations(), ...stockLocations];
  }

  const locationIds = new Set(stockLocations.map((l) => l.id));
  const itemIds = new Set(stockItems.map((it) => it.id));

  const stockBatches: StockBatch[] = uniqBy(
    list<StockBatch>(d.stockBatches).filter((b) => typeof b.id === 'string' && b.id && itemIds.has(b.itemId)),
    (b) => b.id,
  ).map((b) => ({
    ...b,
    lot: String(b.lot ?? '').trim() || b.id,
    expiry: isDate(b.expiry) ? b.expiry : undefined,
    createdAt: num(b.createdAt, Date.now()),
  }));
  const batchIds = new Set(stockBatches.map((b) => b.id));

  const MOVE_TYPES = new Set(['in', 'out', 'adjust', 'transfer']);
  const FUNDINGS = new Set(['wallet', 'payable', 'opening', 'none']);
  const stockMoves: StockMove[] = uniqBy(
    list<StockMove>(d.stockMoves).filter(
      (m) => typeof m.id === 'string' && m.id && isDate(m.date) && itemIds.has(m.itemId) && MOVE_TYPES.has(m.type),
    ),
    (m) => m.id,
  ).map((m) => {
    const loc = locationIds.has(m.locationId) ? m.locationId : DEFAULT_LOCATION_ID;
    const x: StockMove = {
      ...m,
      locationId: loc,
      toLocationId: m.toLocationId && locationIds.has(m.toLocationId) ? m.toLocationId : undefined,
      qty: round2(Math.abs(num(m.qty))),
      unitCost: m.unitCost !== undefined ? round2(Math.max(0, num(m.unitCost))) : undefined,
      note: typeof m.note === 'string' ? m.note : undefined,
      ref: typeof m.ref === 'string' && m.ref ? m.ref : '',
      funding: FUNDINGS.has(m.funding) ? m.funding : m.type === 'in' ? 'wallet' : 'none',
      walletAccountId: typeof m.walletAccountId === 'string' ? m.walletAccountId : undefined,
      payableAccountId: typeof m.payableAccountId === 'string' ? m.payableAccountId : undefined,
      batchId: m.batchId && batchIds.has(m.batchId) ? m.batchId : undefined,
      saleTxId: typeof m.saleTxId === 'string' ? m.saleTxId : undefined,
      adjustSign: m.type === 'adjust' ? (m.adjustSign === -1 ? -1 : 1) : undefined,
      createdAt: num(m.createdAt, Date.now()),
    };
    return x;
  });
  for (const m of stockMoves) if (!m.ref) m.ref = nextRef(stockMoves, stockMovePrefix(m.type), m.date);

  const PO_STATUS = new Set(['draft', 'ordered', 'partial', 'received', 'cancelled']);
  const purchaseOrders: PurchaseOrder[] = uniqBy(
    list<PurchaseOrder>(d.purchaseOrders).filter((p) => typeof p.id === 'string' && p.id && isDate(p.date)),
    (p) => p.id,
  ).map((p) => {
    const lines = Array.isArray(p.lines)
      ? p.lines
          .filter((l) => l && itemIds.has(l.itemId))
          .map((l) => ({
            itemId: l.itemId,
            qty: round2(Math.abs(num(l.qty))),
            unitCost: round2(Math.max(0, num(l.unitCost))),
            receivedQty: round2(Math.max(0, num(l.receivedQty))),
          }))
      : [];
    return {
      ...p,
      supplier: typeof p.supplier === 'string' ? p.supplier : undefined,
      status: PO_STATUS.has(p.status) ? p.status : 'draft',
      locationId: locationIds.has(p.locationId) ? p.locationId : DEFAULT_LOCATION_ID,
      lines,
      note: typeof p.note === 'string' ? p.note : undefined,
      ref: typeof p.ref === 'string' && p.ref ? p.ref : '',
      createdAt: num(p.createdAt, Date.now()),
      updatedAt: num(p.updatedAt, num(p.createdAt, Date.now())),
    };
  });
  for (const p of purchaseOrders) if (!p.ref) p.ref = nextRef(purchaseOrders, 'PO', p.date);

  return {
    version: 1,
    profile,
    accounts,
    transactions,
    budgets,
    assets,
    goals,
    templates,
    stockCategories,
    stockItems,
    stockLocations,
    stockMoves,
    stockBatches,
    purchaseOrders,
  };
}

function stockMovePrefix(type: StockMove['type']): string {
  switch (type) {
    case 'in':
      return 'STM';
    case 'out':
      return 'STK';
    case 'adjust':
      return 'STO';
    case 'transfer':
      return 'STT';
    default:
      return 'ST';
  }
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

let storageWarned = false;

const underlyingStorage = (() => {
  const mem = new Map<string, string>();
  const memStorage: Storage = {
    length: 0,
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
  try {
    const k = '__keuanganku_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return {
      get length() {
        try {
          return localStorage.length;
        } catch {
          return mem.size;
        }
      },
      clear: () => {
        try {
          localStorage.clear();
        } catch {
          mem.clear();
        }
      },
      key: (i: number) => {
        try {
          return localStorage.key(i);
        } catch {
          return memStorage.key(i);
        }
      },
      getItem: (k: string) => {
        try {
          return localStorage.getItem(k) ?? mem.get(k) ?? null;
        } catch {
          return mem.get(k) ?? null;
        }
      },
      setItem: (k: string, v: string) => {
        try {
          localStorage.setItem(k, v);
          mem.delete(k);
        } catch {
          mem.set(k, v);
          if (!storageWarned) {
            storageWarned = true;
            toast('Penyimpanan lokal penuh', {
              tone: 'danger',
              detail: 'Ekspor cadangan JSON di Pengaturan agar perubahan tidak hilang saat tab ditutup.',
            });
          }
        }
      },
      removeItem: (k: string) => {
        mem.delete(k);
        try {
          localStorage.removeItem(k);
        } catch {
          /* abaikan */
        }
      },
    } as Storage;
  } catch {
    return memStorage;
  }
})();

const jsonStorage = createJSONStorage(() => underlyingStorage)!;

/** JSON.parse gagal / data korup → null, jangan sampai layar putih. */
const safeStorage = {
  getItem: (...args: Parameters<typeof jsonStorage.getItem>) => {
    try {
      const v = jsonStorage.getItem(...args);
      return v instanceof Promise ? v.catch(() => null) : v;
    } catch (err) {
      console.error('Gagal membaca neraca.data:', err);
      return null;
    }
  },
  setItem: (...args: Parameters<typeof jsonStorage.setItem>) => jsonStorage.setItem(...args),
  removeItem: (...args: Parameters<typeof jsonStorage.removeItem>) => jsonStorage.removeItem(...args),
};

/** Penulisan ditunda & digabung agar mengetik/undo cepat tidak membekukan HP lambat. */
const dataStorage = deferStorage(safeStorage);

/** Tulis perubahan tertunda ke localStorage sekarang (mis. sebelum membaca langsung untuk cadangan). */
export const flushDataStorage = () => dataStorage.flush();

if (typeof window !== 'undefined') {
  // Aplikasi bisa ditutup kapan saja (APK di latar belakang): simpan saat halaman disembunyikan.
  window.addEventListener('pagehide', flushDataStorage);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushDataStorage();
  });
}

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
      // Nama kunci 'neraca.*' dipertahankan agar data tersimpan tetap terbaca.
      name: 'neraca.data',
      version: 1,
      storage: dataStorage,
      partialize: (s) => ({ data: s.data }) as unknown as DataState,
      merge: (persisted, current) => {
        try {
          const p = persisted as Partial<DataState> | undefined;
          if (!p?.data) return current;
          return { ...current, data: normalizeData(p.data) };
        } catch (err) {
          console.error('Gagal memuat data buku tersimpan:', err);
          queueMicrotask(() =>
            toast('Data buku tidak dapat dimuat penuh', {
              tone: 'danger',
              detail: 'Coba pulihkan dari berkas cadangan di Pengaturan › Data & cadangan.',
              duration: 8000,
            }),
          );
          return current;
        }
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
      // nomor baru hanya bila jenis dokumennya berubah (awalan berbeda) — nomor kustom tidak ditimpa saat mengedit kolom lain.
      const prevPre = refPrefix(t);
      const nextPre = refPrefix(merged);
      if (patch.ref === undefined && prevPre !== nextPre) {
        const next = issueRef({ ...s, profile }, nextPre, merged.date, s.transactions.filter((x) => x.id !== id));
        merged.ref = next.ref;
        profile = withSeq(profile, next.head, next.n);
      }
      return clean(merged);
    });
    return { ...s, profile, transactions };
  });
}

/** Menghapus transaksi beserta turunannya (pembayaran hutang/piutang), anggaran hutang, dan mutasi stok terikat penjualan. */
export function deleteTransactions(ids: string[], label?: string) {
  const all = new Set(ids);
  const d = getData();
  for (const t of d.transactions) if (t.parentId && all.has(t.parentId)) all.add(t.id);
  return commit(label ?? (ids.length > 1 ? `Hapus ${ids.length} transaksi` : 'Hapus transaksi'), (s) => ({
    ...s,
    transactions: s.transactions.filter((t) => !all.has(t.id)),
    budgets: s.budgets.filter((b) => !(budgetKind(b) === 'debt' && b.debtId && all.has(b.debtId))),
    stockMoves: s.stockMoves.filter((m) => !m.saleTxId || !all.has(m.saleTxId)),
  }));
}

/** Pemasukan + keluar stok (HPP) dalam satu langkah riwayat. */
export function addIncomeWithStock(
  input: TxInput,
  stock: { itemId: string; qty: number; locationId?: string },
  label = 'Tambah penjualan stok',
) {
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
  const moveIssued = issueRef(
    { ...d, profile: issued ? withSeq(d.profile, issued.head, issued.n) : d.profile },
    'STK',
    input.date,
    d.stockMoves,
  );
  const move: StockMove = {
    id: uid('smv'),
    date: input.date,
    type: 'out',
    itemId: stock.itemId,
    locationId: stock.locationId || DEFAULT_LOCATION_ID,
    qty: round2(Math.abs(stock.qty)),
    funding: 'none',
    ref: moveIssued.ref,
    saleTxId: tx.id,
    note: `Penjualan ${tx.ref}`,
    createdAt: now + 1,
  };
  let profile = issued ? withSeq(d.profile, issued.head, issued.n) : d.profile;
  profile = withSeq(profile, moveIssued.head, moveIssued.n);
  const historyId = commit(label, (s) => ({
    ...s,
    profile,
    transactions: [...s.transactions, tx],
    stockMoves: [...s.stockMoves, move],
  }));
  return { tx, move, historyId };
}

export function childCount(ids: string[]): number {
  const set = new Set(ids);
  return getData().transactions.filter((t) => t.parentId && set.has(t.parentId) && !set.has(t.id)).length;
}

export function canDuplicateTransaction(t: Pick<Transaction, 'type'>): boolean {
  return t.type !== 'opening' && t.type !== 'payable_pay' && t.type !== 'receivable_collect' && t.type !== 'receivable_writeoff';
}

export function duplicateTransaction(id: string, date = todayISO()) {
  const src = getData().transactions.find((t) => t.id === id);
  if (!src || !canDuplicateTransaction(src)) return null;
  const { id: _i, ref: _r, createdAt: _c, updatedAt: _u, ...rest } = src;
  void _i; void _r; void _c; void _u;
  const r = addTransaction({ ...rest, date }, 'Duplikat transaksi');
  return r.historyId ? r : null;
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
    accounts: s.accounts.map((a) => {
      if (a.id !== id) return a;
      const subtype = patch.subtype && SUBTYPE_META[patch.subtype] ? patch.subtype : a.subtype;
      const type = patch.subtype && SUBTYPE_META[patch.subtype] ? SUBTYPE_META[patch.subtype].type : (patch.type ?? a.type);
      return { ...a, ...patch, subtype, type };
    }),
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
  if (d.budgets.some((b) => budgetKind(b) === 'expense' && b.categoryId === id)) n++;
  for (const it of d.stockItems) {
    if (it.inventoryAccountId === id || it.cogsAccountId === id || it.revenueAccountId === id) n++;
  }
  for (const m of d.stockMoves) {
    if (m.walletAccountId === id || m.payableAccountId === id) n++;
  }
  return n;
}

export function deleteAccount(id: string) {
  const acc = getData().accounts.find((a) => a.id === id);
  if (!acc || acc.system || SYSTEM_IDS.has(id) || accountUsage(id) > 0) return '';
  return commit('Hapus akun', (s) => ({
    ...s,
    accounts: s.accounts.filter((a) => a.id !== id),
    transactions: s.transactions.filter((t) => !(t.type === 'opening' && t.accountId === id)),
    budgets: s.budgets.filter((b) => !(budgetKind(b) === 'expense' && b.categoryId === id)),
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
    const accounts = s.accounts.map((a) => {
      if (a.id !== id) return a;
      const subtype = patch.subtype && SUBTYPE_META[patch.subtype] ? patch.subtype : a.subtype;
      const type = patch.subtype && SUBTYPE_META[patch.subtype] ? SUBTYPE_META[patch.subtype].type : (patch.type ?? a.type);
      return { ...a, ...patch, subtype, type };
    });
    const amount = round2(opening.amount || 0);
    const openings = s.transactions.filter((t) => t.type === 'opening' && t.accountId === id);
    const existing = openings[0];
    let transactions = s.transactions;
    if (existing) {
      if (!amount) {
        transactions = transactions.filter((t) => !(t.type === 'opening' && t.accountId === id));
      } else if (existing.amount !== amount || existing.date !== opening.date || openings.length > 1) {
        // nomor bukti saldo awal utama tidak berubah walau tanggalnya dipindah; duplikat saldo awal dibersihkan
        transactions = transactions
          .filter((t) => !(t.type === 'opening' && t.accountId === id && t.id !== existing.id))
          .map((t) => (t.id === existing.id ? { ...t, amount, date: opening.date, updatedAt: Date.now() } : t));
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
  const type = SUBTYPE_META[rest.subtype].type;
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

export function upsertBudget(target: string | BudgetTarget, amount: number) {
  const spec: BudgetTarget = typeof target === 'string' ? { kind: 'expense', categoryId: target } : target;
  const key = budgetTargetKey(spec);
  return commit('Simpan anggaran', (s) => {
    const ex = s.budgets.find((b) => budgetTargetKey(b) === key);
    const amt = round2(amount);
    if (ex) return { ...s, budgets: s.budgets.map((b) => (b.id === ex.id ? { ...b, amount: amt } : b)) };
    const nb: Budget =
      spec.kind === 'debt'
        ? spec.debtId
          ? { id: uid('bg'), kind: 'debt', debtId: spec.debtId, amount: amt, createdAt: Date.now() }
          : { id: uid('bg'), kind: 'debt', amount: amt, createdAt: Date.now() }
        : { id: uid('bg'), categoryId: spec.categoryId, amount: amt, createdAt: Date.now() };
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
    name: input.name.trim() || input.name,
    cost: round2(Math.abs(input.cost)),
    residualValue: round2(Math.max(0, input.residualValue)),
    usefulLifeMonths: Math.max(1, Math.round(input.usefulLifeMonths)),
    id: uid('ast'),
    ref: issued.ref,
    createdAt: Date.now(),
  };
  const historyId = commit('Tambah aset tetap', (s) => ({ ...s, profile: withSeq(s.profile, issued.head, issued.n), assets: [...s.assets, asset] }));
  return { asset, historyId };
}

export function updateAsset(id: string, patch: Partial<FixedAsset>, label = 'Ubah aset tetap') {
  return commit(label, (s) => ({
    ...s,
    assets: s.assets.map((a) => {
      if (a.id !== id) return a;
      const next: FixedAsset = { ...a, ...patch };
      if (patch.name !== undefined) next.name = patch.name.trim() || a.name;
      if (patch.cost !== undefined && Number.isFinite(patch.cost)) next.cost = round2(Math.abs(patch.cost));
      if (patch.residualValue !== undefined && Number.isFinite(patch.residualValue)) next.residualValue = round2(Math.max(0, patch.residualValue));
      if (patch.usefulLifeMonths !== undefined && Number.isFinite(patch.usefulLifeMonths)) next.usefulLifeMonths = Math.max(1, Math.round(patch.usefulLifeMonths));
      if ('disposal' in patch && patch.disposal) {
        const proceeds = Number.isFinite(patch.disposal.proceeds) ? round2(Math.max(0, patch.disposal.proceeds)) : 0;
        next.disposal = { ...patch.disposal, proceeds };
      }
      return next;
    }),
  }));
}

export function deleteAsset(id: string) {
  return commit('Hapus aset tetap', (s) => ({ ...s, assets: s.assets.filter((a) => a.id !== id) }));
}

/* Target tabungan */

export function addGoal(input: Omit<Goal, 'id' | 'createdAt'>) {
  const name = input.name.trim() || 'Target tabungan';
  const target = Number.isFinite(input.target) && input.target > 0 ? round2(input.target) : 0;
  if (!(target > 0)) return '';
  const goal: Goal = { ...input, name, target, id: uid('goal'), createdAt: Date.now() };
  return commit('Tambah target tabungan', (s) => ({ ...s, goals: [...s.goals, goal] }));
}

export function updateGoal(id: string, patch: Partial<Goal>) {
  return commit('Ubah target tabungan', (s) => ({
    ...s,
    goals: s.goals.map((g) => {
      if (g.id !== id) return g;
      const name = patch.name !== undefined ? patch.name.trim() || g.name : g.name;
      const rawTarget = patch.target !== undefined ? patch.target : g.target;
      const target = Number.isFinite(rawTarget) && rawTarget > 0 ? round2(rawTarget) : g.target;
      return { ...g, ...patch, name, target };
    }),
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

/* Persediaan */

function cleanItemFields(it: StockItem): StockItem {
  const next = { ...it };
  if (next.costPrice !== undefined) {
    next.costPrice = round2(Math.max(0, next.costPrice));
    if (!(next.costPrice > 0)) delete next.costPrice;
  }
  if (next.reorderQty !== undefined) {
    next.reorderQty = round2(Math.max(0, next.reorderQty));
    if (!(next.reorderQty > 0)) delete next.reorderQty;
  }
  if (next.barcode !== undefined) {
    next.barcode = next.barcode.trim();
    if (!next.barcode) delete next.barcode;
  }
  if (next.brand !== undefined) {
    next.brand = next.brand.trim();
    if (!next.brand) delete next.brand;
  }
  if (next.description !== undefined) {
    next.description = next.description.trim();
    if (!next.description) delete next.description;
  }
  if (next.notes !== undefined) {
    next.notes = next.notes.trim();
    if (!next.notes) delete next.notes;
  }
  if (next.categoryId === '') delete next.categoryId;
  return next;
}

export function addStockCategory(input: { name: string; icon?: string; color?: string } | string) {
  const raw = typeof input === 'string' ? { name: input } : input;
  const cat: StockCategory = {
    id: uid('scat'),
    name: raw.name.trim() || 'Kategori',
    icon: raw.icon?.trim() || 'package',
    color: raw.color?.trim() || '#8A6546',
    createdAt: Date.now(),
  };
  const historyId = commit('Tambah kategori stok', (s) => ({ ...s, stockCategories: [...(s.stockCategories ?? []), cat] }));
  return { category: cat, historyId };
}

export function updateStockCategory(id: string, patch: Partial<StockCategory>, label = 'Ubah kategori stok') {
  return commit(label, (s) => ({
    ...s,
    stockCategories: (s.stockCategories ?? []).map((c) => {
      if (c.id !== id) return c;
      const next = { ...c, ...patch };
      if (patch.name !== undefined) next.name = patch.name.trim() || c.name;
      if (patch.icon !== undefined) next.icon = patch.icon.trim() || c.icon;
      if (patch.color !== undefined) next.color = patch.color.trim() || c.color;
      return next;
    }),
  }));
}

export function deleteStockCategory(id: string) {
  return commit('Hapus kategori stok', (s) => ({
    ...s,
    stockCategories: (s.stockCategories ?? []).filter((c) => c.id !== id),
    stockItems: s.stockItems.map((it) => (it.categoryId === id ? { ...it, categoryId: undefined } : it)),
  }));
}

export function addStockItem(input: Omit<StockItem, 'id' | 'createdAt'>) {
  const item = cleanItemFields({
    ...input,
    id: uid('stk'),
    sku: input.sku.trim(),
    name: input.name.trim() || 'Barang',
    unit: input.unit.trim() || 'pcs',
    minQty: Math.max(0, round2(input.minQty || 0)),
    sellPrice: input.sellPrice !== undefined ? round2(Math.max(0, input.sellPrice)) : undefined,
    inventoryAccountId: input.inventoryAccountId || SYS.inventory,
    trackBatch: input.trackBatch || undefined,
    createdAt: Date.now(),
  });
  const historyId = commit('Tambah barang', (s) => ({ ...s, stockItems: [...s.stockItems, item] }));
  return { item, historyId };
}

export function updateStockItem(id: string, patch: Partial<StockItem>, label = 'Ubah barang') {
  return commit(label, (s) => ({
    ...s,
    stockItems: s.stockItems.map((it) => {
      if (it.id !== id) return it;
      let next: StockItem = { ...it, ...patch };
      if (patch.name !== undefined) next.name = patch.name.trim() || it.name;
      if (patch.sku !== undefined) next.sku = patch.sku.trim();
      if (patch.unit !== undefined) next.unit = patch.unit.trim() || 'pcs';
      if (patch.minQty !== undefined) next.minQty = Math.max(0, round2(patch.minQty));
      if (patch.sellPrice !== undefined) next.sellPrice = round2(Math.max(0, patch.sellPrice));
      if (patch.categoryId === null || patch.categoryId === '') next.categoryId = undefined;
      next = cleanItemFields(next);
      return next;
    }),
  }));
}

export function deleteStockItem(id: string) {
  return commit('Hapus barang', (s) => ({
    ...s,
    stockItems: s.stockItems.filter((it) => it.id !== id),
    stockMoves: s.stockMoves.filter((m) => m.itemId !== id),
    stockBatches: s.stockBatches.filter((b) => b.itemId !== id),
    purchaseOrders: s.purchaseOrders.map((p) => ({ ...p, lines: p.lines.filter((l) => l.itemId !== id) })),
  }));
}

export function addStockLocation(name: string) {
  const loc: StockLocation = { id: uid('loc'), name: name.trim() || 'Lokasi', createdAt: Date.now() };
  const historyId = commit('Tambah lokasi stok', (s) => ({ ...s, stockLocations: [...s.stockLocations, loc] }));
  return { location: loc, historyId };
}

export function updateStockLocation(id: string, patch: Partial<StockLocation>, label = 'Ubah lokasi stok') {
  return commit(label, (s) => ({
    ...s,
    stockLocations: s.stockLocations.map((l) => (l.id === id ? { ...l, ...patch, name: patch.name !== undefined ? patch.name.trim() || l.name : l.name } : l)),
  }));
}

export function deleteStockLocation(id: string) {
  if (id === DEFAULT_LOCATION_ID) return '';
  const d = getData();
  if (d.stockMoves.some((m) => m.locationId === id || m.toLocationId === id)) return '';
  if (d.purchaseOrders.some((p) => p.locationId === id)) return '';
  return commit('Hapus lokasi stok', (s) => ({ ...s, stockLocations: s.stockLocations.filter((l) => l.id !== id) }));
}

export function addStockBatch(input: Omit<StockBatch, 'id' | 'createdAt'>) {
  const batch: StockBatch = { ...input, id: uid('bat'), lot: input.lot.trim() || 'LOT', createdAt: Date.now() };
  const historyId = commit('Tambah batch stok', (s) => ({ ...s, stockBatches: [...s.stockBatches, batch] }));
  return { batch, historyId };
}

export function addStockMove(input: Omit<StockMove, 'id' | 'ref' | 'createdAt'> & { ref?: string }) {
  const d = getData();
  const prefix = stockMovePrefix(input.type);
  const issued = input.ref ? null : issueRef(d, prefix, input.date, d.stockMoves);
  const move: StockMove = {
    ...input,
    id: uid('smv'),
    qty: round2(Math.abs(input.qty || 0)),
    unitCost: input.unitCost !== undefined ? round2(Math.max(0, input.unitCost)) : undefined,
    ref: input.ref || issued!.ref,
    funding: input.funding ?? (input.type === 'in' ? 'wallet' : 'none'),
    adjustSign: input.type === 'adjust' ? (input.adjustSign === -1 ? -1 : 1) : undefined,
    createdAt: Date.now(),
  };
  const historyId = commit('Mutasi stok', (s) => ({
    ...s,
    profile: issued ? withSeq(s.profile, issued.head, issued.n) : s.profile,
    stockMoves: [...s.stockMoves, move],
  }));
  return { move, historyId };
}

export function updateStockMove(id: string, patch: Partial<StockMove>, label = 'Ubah mutasi stok') {
  return commit(label, (s) => ({
    ...s,
    stockMoves: s.stockMoves.map((m) => {
      if (m.id !== id) return m;
      const next: StockMove = { ...m, ...patch };
      if (patch.qty !== undefined) next.qty = round2(Math.abs(patch.qty));
      if (patch.unitCost !== undefined) next.unitCost = round2(Math.max(0, patch.unitCost));
      if (patch.type === 'adjust' || (patch.adjustSign !== undefined && next.type === 'adjust'))
        next.adjustSign = patch.adjustSign === -1 || next.adjustSign === -1 ? -1 : 1;
      return next;
    }),
  }));
}

export function deleteStockMove(id: string) {
  return commit('Hapus mutasi stok', (s) => ({ ...s, stockMoves: s.stockMoves.filter((m) => m.id !== id) }));
}

export function addPurchaseOrder(input: Omit<PurchaseOrder, 'id' | 'ref' | 'createdAt' | 'updatedAt'> & { ref?: string }) {
  const d = getData();
  const now = Date.now();
  const issued = input.ref ? null : issueRef(d, 'PO', input.date, d.purchaseOrders);
  const po: PurchaseOrder = {
    ...input,
    id: uid('po'),
    lines: input.lines.map((l) => ({
      itemId: l.itemId,
      qty: round2(Math.abs(l.qty)),
      unitCost: round2(Math.max(0, l.unitCost)),
      receivedQty: round2(Math.max(0, l.receivedQty || 0)),
    })),
    ref: input.ref || issued!.ref,
    createdAt: now,
    updatedAt: now,
  };
  const historyId = commit('Tambah pesanan pembelian', (s) => ({
    ...s,
    profile: issued ? withSeq(s.profile, issued.head, issued.n) : s.profile,
    purchaseOrders: [...s.purchaseOrders, po],
  }));
  return { po, historyId };
}

export function updatePurchaseOrder(id: string, patch: Partial<PurchaseOrder>, label = 'Ubah pesanan pembelian') {
  return commit(label, (s) => ({
    ...s,
    purchaseOrders: s.purchaseOrders.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)),
  }));
}

export function deletePurchaseOrder(id: string) {
  return commit('Hapus pesanan pembelian', (s) => ({ ...s, purchaseOrders: s.purchaseOrders.filter((p) => p.id !== id) }));
}

/** Terima sebagian/penuh baris PO → mutasi masuk + update receivedQty. */
export function receivePurchaseOrder(
  poId: string,
  receipts: { itemId: string; qty: number }[],
  opts: { date: string; funding: StockMove['funding']; walletAccountId?: string; payableAccountId?: string },
) {
  const d = getData();
  const po = d.purchaseOrders.find((p) => p.id === poId);
  if (!po || po.status === 'cancelled') return '';
  const moves: StockMove[] = [];
  let profile = d.profile;
  const lines = po.lines.map((l) => ({ ...l }));
  for (const r of receipts) {
    const line = lines.find((l) => l.itemId === r.itemId);
    if (!line) continue;
    const remain = round2(Math.max(0, line.qty - line.receivedQty));
    const qty = round2(Math.min(remain, Math.abs(r.qty)));
    if (!(qty > 0)) continue;
    const issued = issueRef({ ...d, profile }, 'STM', opts.date, [...d.stockMoves, ...moves]);
    profile = withSeq(profile, issued.head, issued.n);
    moves.push({
      id: uid('smv'),
      date: opts.date,
      type: 'in',
      itemId: r.itemId,
      locationId: po.locationId,
      qty,
      unitCost: line.unitCost,
      note: `Terima ${po.ref}`,
      ref: issued.ref,
      funding: opts.funding,
      walletAccountId: opts.walletAccountId,
      payableAccountId: opts.payableAccountId,
      createdAt: Date.now(),
    });
    line.receivedQty = round2(line.receivedQty + qty);
  }
  if (!moves.length) return '';
  const allDone = lines.every((l) => l.receivedQty + 0.0005 >= l.qty);
  const any = lines.some((l) => l.receivedQty > 0.0005);
  const status = allDone ? 'received' : any ? 'partial' : po.status;
  return commit('Terima pesanan pembelian', (s) => ({
    ...s,
    profile,
    stockMoves: [...s.stockMoves, ...moves],
    purchaseOrders: s.purchaseOrders.map((p) => (p.id === poId ? { ...p, lines, status, updatedAt: Date.now() } : p)),
  }));
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
