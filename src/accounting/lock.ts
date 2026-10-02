/*
 * Kunci periode (tutup buku).
 * Setelah laporan sebuah periode diterbitkan, angkanya tidak boleh berubah diam-diam. Semua perubahan
 * data melewati satu pintu (commit di store), dan fungsi di sini membandingkan data sebelum/sesudah:
 * transaksi atau aset tetap yang menyentuh tanggal pada/sebelum tanggal kunci ditolak — dari formulir
 * mana pun perubahan itu datang.
 */
import type { Account, AppData, FixedAsset, Transaction } from './types';

export const isLocked = (date: string | undefined, lockDate: string | undefined): boolean => !!lockDate && !!date && date <= lockDate;

export interface LockViolation {
  kind: 'tx' | 'asset' | 'account' | 'profile';
  ref: string;
  date: string;
}

/** Bidang aset yang menentukan jurnal perolehan & penyusutan. */
const ASSET_BOOK_KEYS: (keyof FixedAsset)[] = [
  'accountId',
  'acquisitionDate',
  'cost',
  'residualValue',
  'usefulLifeMonths',
  'method',
  'depreciable',
  'funding',
  'paidFromAccountId',
];

function txViolations(prev: Transaction[], next: Transaction[], lock: string): LockViolation[] {
  const out: LockViolation[] = [];
  const locked = (d?: string) => isLocked(d, lock);
  const before = new Map(prev.map((t) => [t.id, t]));
  const seen = new Set<string>();
  for (const t of next) {
    seen.add(t.id);
    const o = before.get(t.id);
    if (o === t) continue;
    if (!o) {
      if (locked(t.date)) out.push({ kind: 'tx', ref: t.ref, date: t.date });
    } else if (locked(o.date) || locked(t.date)) {
      out.push({ kind: 'tx', ref: o.ref || t.ref, date: locked(o.date) ? o.date : t.date });
    }
  }
  for (const o of prev) if (!seen.has(o.id) && locked(o.date)) out.push({ kind: 'tx', ref: o.ref, date: o.date });
  return out;
}

function assetViolations(prev: FixedAsset[], next: FixedAsset[], lock: string): LockViolation[] {
  const out: LockViolation[] = [];
  const locked = (d?: string) => isLocked(d, lock);
  const before = new Map(prev.map((a) => [a.id, a]));
  const seen = new Set<string>();
  for (const a of next) {
    seen.add(a.id);
    const o = before.get(a.id);
    if (o === a) continue;
    if (!o) {
      if (locked(a.acquisitionDate)) out.push({ kind: 'asset', ref: a.ref, date: a.acquisitionDate });
      continue;
    }
    // Perubahan nilai/umur aset yang sudah diperoleh di periode terkunci mengubah jurnal di periode itu.
    const bookChanged = ASSET_BOOK_KEYS.some((k) => o[k] !== a[k]);
    if (bookChanged && (locked(o.acquisitionDate) || locked(a.acquisitionDate)))
      out.push({ kind: 'asset', ref: o.ref, date: locked(o.acquisitionDate) ? o.acquisitionDate : a.acquisitionDate });
    const od = o.disposal;
    const nd = a.disposal;
    const disposalChanged = od?.date !== nd?.date || od?.proceeds !== nd?.proceeds || od?.accountId !== nd?.accountId;
    if (disposalChanged && (locked(od?.date) || locked(nd?.date)))
      out.push({ kind: 'asset', ref: o.ref, date: (locked(od?.date) ? od?.date : nd?.date) ?? a.acquisitionDate });
  }
  for (const o of prev) if (!seen.has(o.id) && locked(o.acquisitionDate)) out.push({ kind: 'asset', ref: o.ref, date: o.acquisitionDate });
  return out;
}

/** Apakah akun dipakai oleh transaksi/aset yang bertanggal pada atau sebelum tanggal kunci. */
function usedInLocked(data: AppData, id: string, lock: string): boolean {
  const originById = new Map(data.transactions.map((t) => [t.id, t]));
  for (const t of data.transactions) {
    if (!isLocked(t.date, lock)) continue;
    if (t.accountId === id || t.toAccountId === id || t.categoryId === id || t.debtAccountId === id) return true;
    if (t.lines?.some((l) => l.accountId === id)) return true;
    // pembayaran hutang/piutang memakai akun kontrol milik transaksi induknya
    if (t.parentId && originById.get(t.parentId)?.debtAccountId === id) return true;
  }
  for (const a of data.assets) {
    if (isLocked(a.acquisitionDate, lock) && (a.accountId === id || a.paidFromAccountId === id)) return true;
    if (a.disposal && isLocked(a.disposal.date, lock) && a.disposal.accountId === id) return true;
  }
  return false;
}

/**
 * Mengubah jenis akun (mis. bank → investasi, beban operasional → beban lain-lain) menggeser angka laporan
 * seluruh riwayatnya. Bila akun itu dipakai di periode terkunci, perubahannya ditolak.
 */
function accountViolations(prev: AppData, next: AppData, lock: string): LockViolation[] {
  const out: LockViolation[] = [];
  const before = new Map<string, Account>(prev.accounts.map((a) => [a.id, a]));
  for (const a of next.accounts) {
    const o = before.get(a.id);
    if (!o || o === a || (o.subtype === a.subtype && o.type === a.type)) continue;
    if (usedInLocked(prev, a.id, lock)) out.push({ kind: 'account', ref: o.name, date: lock });
  }
  return out;
}

/**
 * Pelanggaran kunci periode akibat perubahan `prev` → `next`. Memakai tanggal kunci pada data
 * sebelum perubahan, sehingga mengubah/membuka kunci itu sendiri selalu diperbolehkan.
 */
export function lockViolations(prev: AppData, next: AppData): LockViolation[] {
  const lock = prev.profile.lockDate;
  if (!lock) return [];
  return [
    ...(prev.transactions !== next.transactions ? txViolations(prev.transactions, next.transactions, lock) : []),
    ...(prev.assets !== next.assets ? assetViolations(prev.assets, next.assets, lock) : []),
    ...(prev.accounts !== next.accounts ? accountViolations(prev, next, lock) : []),
    // awal tahun buku menentukan pemisahan saldo laba & laba tahun berjalan di laporan yang sudah terbit
    ...(prev.profile.fiscalYearStartMonth !== next.profile.fiscalYearStartMonth
      ? [{ kind: 'profile' as const, ref: 'Awal tahun buku', date: lock }]
      : []),
  ];
}
