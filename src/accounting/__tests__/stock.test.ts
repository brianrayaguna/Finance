import { describe, expect, it } from 'vitest';
import { SYS } from '../coa';
import { buildJournal, entryTotals, stockEntries, makeCtx } from '../engine';
import { avgCostBefore, computeStock, defaultLocations, moveSignedQty } from '../stock';
import { emptyData, normalizeData } from '../../store/data';
import type { AppData, StockItem, StockMove } from '../types';

const item = (id = 'it1'): StockItem => ({
  id,
  sku: 'SKU-1',
  name: 'Mug',
  unit: 'pcs',
  minQty: 10,
  inventoryAccountId: SYS.inventory,
  cogsAccountId: SYS.cogs,
  createdAt: 1,
});

const move = (partial: Partial<StockMove> & Pick<StockMove, 'id' | 'type' | 'qty'>): StockMove => ({
  date: '2026-01-10',
  itemId: 'it1',
  locationId: 'loc-main',
  ref: `STM/2026/01/${partial.id}`,
  funding: partial.type === 'in' ? 'wallet' : 'none',
  walletAccountId: SYS.cash,
  createdAt: Number(partial.id.replace(/\D/g, '') || 1),
  ...partial,
});

describe('stock valuation', () => {
  it('weighted average after two purchases and a sale', () => {
    const moves = [
      move({ id: '1', type: 'in', qty: 100, unitCost: 4000 }),
      move({ id: '2', type: 'in', qty: 50, unitCost: 5500, date: '2026-01-15', createdAt: 2 }),
      move({ id: '3', type: 'out', qty: 30, date: '2026-01-20', createdAt: 3 }),
    ];
    const snap = computeStock(moves);
    const s = snap.byItem.get('it1')!;
    expect(s.qty).toBe(120);
    expect(s.avgCost).toBe(4500);
    expect(s.value).toBe(540_000);
    expect(avgCostBefore(moves, '3', 'it1')).toBe(4500);
  });

  it('transfer moves qty between locations without changing value', () => {
    const moves = [
      move({ id: '1', type: 'in', qty: 40, unitCost: 1000 }),
      move({ id: '2', type: 'transfer', qty: 10, toLocationId: 'loc-b', createdAt: 2 }),
    ];
    const snap = computeStock(moves);
    const s = snap.byItem.get('it1')!;
    expect(s.qty).toBe(40);
    expect(s.value).toBe(40_000);
    expect(s.byLocation.get('loc-main')).toBe(30);
    expect(s.byLocation.get('loc-b')).toBe(10);
  });

  it('moveSignedQty respects adjust sign', () => {
    expect(moveSignedQty(move({ id: '1', type: 'adjust', qty: 5, adjustSign: 1 }))).toBe(5);
    expect(moveSignedQty(move({ id: '2', type: 'adjust', qty: 5, adjustSign: -1 }))).toBe(-5);
  });
});

describe('stock journal', () => {
  it('posts balanced purchase and COGS entries', () => {
    const data: AppData = {
      ...emptyData(),
      stockItems: [item()],
      stockMoves: [
        move({ id: '1', type: 'in', qty: 10, unitCost: 2000 }),
        move({ id: '2', type: 'out', qty: 4, date: '2026-01-12', createdAt: 2 }),
      ],
    };
    const entries = buildJournal(data).filter((e) => e.source === 'stock');
    expect(entries).toHaveLength(2);
    for (const e of entries) expect(entryTotals(e).balanced).toBe(true);
    const buy = entries[0];
    expect(buy.lines.some((l) => l.accountId === SYS.inventory && l.debit === 20_000)).toBe(true);
    const sale = entries[1];
    expect(sale.lines.some((l) => l.accountId === SYS.cogs && l.debit === 8_000)).toBe(true);
    expect(sale.lines.some((l) => l.accountId === SYS.inventory && l.credit === 8_000)).toBe(true);
  });

  it('skips transfer journal', () => {
    const ctx = makeCtx(emptyData());
    const e = stockEntries(move({ id: '1', type: 'transfer', qty: 3, toLocationId: 'loc-b' }), item(), ctx, []);
    expect(e).toBeNull();
  });
});

describe('normalize stock collections', () => {
  it('adds default location and empty arrays for old backups', () => {
    const old = normalizeData({ ...emptyData(), stockItems: undefined, stockLocations: undefined, stockMoves: undefined } as unknown as AppData);
    expect(old.stockItems).toEqual([]);
    expect(old.stockLocations).toEqual(defaultLocations());
    expect(old.stockMoves).toEqual([]);
    expect(old.stockBatches).toEqual([]);
    expect(old.purchaseOrders).toEqual([]);
    expect(old.stockCategories).toEqual([]);
  });

  it('preserves catalog fields and drops orphan categoryId', () => {
    const d = normalizeData({
      ...emptyData(),
      stockCategories: [{ id: 'c1', name: 'Minuman', createdAt: 1 } as { id: string; name: string; createdAt: number }],
      stockItems: [
        {
          id: 'it1',
          sku: 'SKU-1',
          name: 'Teh',
          unit: 'pcs',
          minQty: 2,
          costPrice: 1500,
          sellPrice: 3000,
          barcode: '0899',
          brand: 'Teh Botol',
          categoryId: 'hilang',
          reorderQty: 12,
          description: 'Teh manis',
          inventoryAccountId: SYS.inventory,
          createdAt: 1,
        },
      ],
    } as unknown as AppData);
    expect(d.stockCategories).toHaveLength(1);
    expect(d.stockCategories[0]).toMatchObject({ name: 'Minuman', icon: 'package', color: '#8A6546' });
    expect(d.stockItems[0]).toMatchObject({ barcode: '0899', brand: 'Teh Botol', costPrice: 1500, reorderQty: 12, description: 'Teh manis' });
    expect(d.stockItems[0].categoryId).toBeUndefined();
  });
});
