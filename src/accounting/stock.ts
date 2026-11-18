/*
 * Persediaan: kuantitas & biaya rata-rata tertimbang diturunkan dari mutasi,
 * lalu jurnal perpetual (Dr/Cr Persediaan & HPP) dibangun di engine.
 */
import { round2, isZero } from '../lib/format';
import type { StockBatch, StockItem, StockLocation, StockMove } from './types';

export const DEFAULT_LOCATION_ID = 'loc-main';

export function defaultLocations(): StockLocation[] {
  return [{ id: DEFAULT_LOCATION_ID, name: 'Utama', createdAt: 1_700_000_000_000 }];
}

export interface ItemStockState {
  qty: number;
  value: number;
  avgCost: number;
  byLocation: Map<string, number>;
}

export interface StockSnapshot {
  byItem: Map<string, ItemStockState>;
  /** running state setelah setiap move (urutan kronologis) — untuk jurnal keluar */
  afterMove: Map<string, { qty: number; value: number; avgCost: number }>;
}

function emptyState(): ItemStockState {
  return { qty: 0, value: 0, avgCost: 0, byLocation: new Map() };
}

/** Tanda kuantitas netto untuk satu mutasi (+ masuk, − keluar). */
export function moveSignedQty(m: StockMove): number {
  const q = Math.abs(m.qty || 0);
  if (!(q > 0)) return 0;
  switch (m.type) {
    case 'in':
      return q;
    case 'out':
      return -q;
    case 'adjust':
      return (m.adjustSign === -1 ? -1 : 1) * q;
    case 'transfer':
      return 0;
    default:
      return 0;
  }
}

export function sortMoves(moves: StockMove[]): StockMove[] {
  return [...moves].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1)));
}

/** Hitung stok on-hand & rata-rata biaya dari seluruh mutasi. */
export function computeStock(moves: StockMove[]): StockSnapshot {
  const byItem = new Map<string, ItemStockState>();
  const afterMove = new Map<string, { qty: number; value: number; avgCost: number }>();

  const state = (itemId: string) => {
    let s = byItem.get(itemId);
    if (!s) byItem.set(itemId, (s = emptyState()));
    return s;
  };

  const bumpLoc = (s: ItemStockState, locId: string, delta: number) => {
    s.byLocation.set(locId, round2((s.byLocation.get(locId) ?? 0) + delta));
  };

  for (const m of sortMoves(moves)) {
    const s = state(m.itemId);
    const q = Math.abs(m.qty || 0);
    if (!(q > 0) && m.type !== 'transfer') {
      afterMove.set(m.id, { qty: s.qty, value: s.value, avgCost: s.avgCost });
      continue;
    }

    if (m.type === 'transfer') {
      if (q > 0 && m.locationId && m.toLocationId && m.locationId !== m.toLocationId) {
        bumpLoc(s, m.locationId, -q);
        bumpLoc(s, m.toLocationId, q);
      }
      afterMove.set(m.id, { qty: s.qty, value: s.value, avgCost: s.avgCost });
      continue;
    }

    const signed = moveSignedQty(m);
    if (signed > 0) {
      const cost = round2(Math.max(0, m.unitCost ?? 0));
      const addVal = round2(signed * cost);
      s.qty = round2(s.qty + signed);
      s.value = round2(s.value + addVal);
      s.avgCost = s.qty > 0.0005 ? round2(s.value / s.qty) : 0;
      bumpLoc(s, m.locationId, signed);
    } else if (signed < 0) {
      const take = Math.min(q, Math.max(0, s.qty));
      const avg = s.avgCost;
      const takeVal = round2(take * avg);
      s.qty = round2(s.qty - take);
      s.value = round2(Math.max(0, s.value - takeVal));
      if (s.qty <= 0.0005) {
        s.qty = 0;
        s.value = 0;
        s.avgCost = 0;
      } else {
        s.avgCost = round2(s.value / s.qty);
      }
      bumpLoc(s, m.locationId, -take);
    }

    afterMove.set(m.id, { qty: s.qty, value: s.value, avgCost: s.avgCost });
  }

  return { byItem, afterMove };
}

/** Biaya rata-rata sebelum mutasi `moveId` diproses (untuk menilai keluar/opname turun). */
export function avgCostBefore(moves: StockMove[], moveId: string, itemId: string): number {
  const prior = sortMoves(moves).filter((m) => m.id !== moveId);
  // Hanya mutasi sebelum moveId dalam urutan kronologis penuh
  const ordered = sortMoves(moves);
  const idx = ordered.findIndex((m) => m.id === moveId);
  const slice = idx < 0 ? prior : ordered.slice(0, idx).filter((m) => m.itemId === itemId);
  const snap = computeStock(slice.length ? slice : prior.filter((m) => m.itemId === itemId));
  return snap.byItem.get(itemId)?.avgCost ?? 0;
}

export function itemQty(snap: StockSnapshot, itemId: string, locationId?: string): number {
  const s = snap.byItem.get(itemId);
  if (!s) return 0;
  if (!locationId) return s.qty;
  return s.byLocation.get(locationId) ?? 0;
}

export function lowStockItems(items: StockItem[], snap: StockSnapshot): StockItem[] {
  return items.filter((it) => !it.archived && it.minQty > 0 && itemQty(snap, it.id) < it.minQty - 0.0005);
}

export function inventoryValue(snap: StockSnapshot): number {
  let v = 0;
  for (const s of snap.byItem.values()) v += s.value;
  return round2(v);
}

export function batchesExpiringSoon(batches: StockBatch[], withinDays: number, today: string): StockBatch[] {
  const t = Date.parse(today + 'T00:00:00');
  const lim = t + withinDays * 86_400_000;
  return batches.filter((b) => {
    if (!b.expiry) return false;
    const e = Date.parse(b.expiry + 'T00:00:00');
    return Number.isFinite(e) && e >= t && e <= lim;
  });
}

/** Pilih batch FEFO (kadaluarsa paling dekat) yang masih punya stok di lokasi — gelombang 3. */
export function pickFefoBatch(
  batches: StockBatch[],
  moves: StockMove[],
  itemId: string,
  locationId: string,
  qtyNeeded: number,
): { batchId: string; qty: number }[] {
  const itemBatches = batches
    .filter((b) => b.itemId === itemId)
    .sort((a, b) => {
      if (!a.expiry && !b.expiry) return a.lot.localeCompare(b.lot);
      if (!a.expiry) return 1;
      if (!b.expiry) return -1;
      return a.expiry < b.expiry ? -1 : a.expiry > b.expiry ? 1 : a.lot.localeCompare(b.lot);
    });
  const remaining = new Map<string, number>();
  for (const b of itemBatches) remaining.set(b.id, 0);
  for (const m of sortMoves(moves)) {
    if (m.itemId !== itemId || !m.batchId || !remaining.has(m.batchId)) continue;
    if (m.type === 'transfer') {
      if (m.toLocationId === locationId) remaining.set(m.batchId, (remaining.get(m.batchId) ?? 0) + Math.abs(m.qty));
      else if (m.locationId === locationId) remaining.set(m.batchId, (remaining.get(m.batchId) ?? 0) - Math.abs(m.qty));
      continue;
    }
    if (m.locationId !== locationId) continue;
    const signed = moveSignedQty(m);
    remaining.set(m.batchId, (remaining.get(m.batchId) ?? 0) + signed);
  }
  let need = qtyNeeded;
  const out: { batchId: string; qty: number }[] = [];
  for (const b of itemBatches) {
    if (need <= 0) break;
    const avail = Math.max(0, remaining.get(b.id) ?? 0);
    if (avail <= 0) continue;
    const take = Math.min(avail, need);
    out.push({ batchId: b.id, qty: take });
    need = round2(need - take);
  }
  return out;
}

export function isZeroQty(n: number): boolean {
  return isZero(n);
}
