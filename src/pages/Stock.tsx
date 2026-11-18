import { useMemo, useState } from 'react';
import {
  Plus,
  Package,
  Ellipsis,
  Pencil,
  Trash2,
  Download,
  Upload,
  Scale,
  ArrowLeftRight,
  Building2,
  NotebookPen,
  Search,
} from '../lib/glyphs';
import { useBooks, useNarrow, useToday } from '../hooks/useApp';
import {
  addPurchaseOrder,
  addStockItem,
  addStockLocation,
  deletePurchaseOrder,
  deleteStockItem,
  deleteStockLocation,
  deleteStockMove,
  receivePurchaseOrder,
  updatePurchaseOrder,
  updateStockItem,
  useData,
} from '../store/data';
import { confirm, toast } from '../store/ui';
import { notify } from '../store/history';
import { SYS } from '../accounting/coa';
import { DEFAULT_LOCATION_ID, computeStock, inventoryValue, itemQty, lowStockItems } from '../accounting/stock';
import type { PurchaseOrder, StockFunding, StockItem, StockMoveType } from '../accounting/types';
import { formatDate, formatMoney, round2 } from '../lib/format';
import { rowAction, useSubmitRef } from '../lib/focus';
import { isImeComposing } from '../lib/layers';
import { PageHeader } from '../components/layout/Topbar';
import { Badge, Button, EmptyState, Field, IconTile, Money, Switch, TextArea, TextInput, TableWrap } from '../components/ui/primitives';
import { Menu } from '../components/ui/Popover';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { Segmented } from '../components/ui/Segmented';
import { AmountInput } from '../components/ui/AmountInput';
import { DatePicker } from '../components/ui/DatePicker';
import { useWalletOptions } from '../components/forms/options';
import { StockCategoryModal } from '../components/forms/StockCategoryModal';
import { StockMoveModal } from '../components/forms/StockMoveModal';

type Tab = 'items' | 'moves' | 'locations' | 'orders';

const UNIT_PRESETS = ['pcs', 'box', 'kg', 'liter', 'pack'] as const;
const UNIT_OTHER = '__other__';

function healthOf(qty: number, minQty: number): 'ok' | 'low' | 'out' {
  if (qty <= 0.0005) return 'out';
  if (minQty > 0 && qty < minQty - 0.0005) return 'low';
  return 'ok';
}

function marginPct(cost?: number, sell?: number): number | null {
  if (!(cost && cost > 0) || !(sell && sell > 0)) return null;
  return ((sell - cost) / cost) * 100;
}

export default function Stock() {
  useBooks();
  const data = useData((s) => s.data);
  const narrow = useNarrow();
  const [tab, setTab] = useState<Tab>('items');
  const [itemModal, setItemModal] = useState<{ editing?: StockItem } | null>(null);
  const [detail, setDetail] = useState<StockItem | null>(null);
  const [moveModal, setMoveModal] = useState<{ type: StockMoveType; itemId?: string } | null>(null);
  const [catModal, setCatModal] = useState(false);
  const [locModal, setLocModal] = useState(false);
  const [poModal, setPoModal] = useState(false);
  const [receivePo, setReceivePo] = useState<PurchaseOrder | null>(null);
  const [scan, setScan] = useState('');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [filterLow, setFilterLow] = useState(false);

  const snap = useMemo(() => computeStock(data.stockMoves), [data.stockMoves]);
  const low = useMemo(() => lowStockItems(data.stockItems, snap), [data.stockItems, snap]);
  const value = inventoryValue(snap);
  const cats = data.stockCategories ?? [];
  const catMap = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const activeItems = data.stockItems.filter((it) => !it.archived);

  const matchedScan = useMemo(() => {
    const q = scan.trim().toLowerCase();
    if (!q) return null;
    return (
      activeItems.find(
        (it) => it.sku.toLowerCase() === q || it.barcode?.toLowerCase() === q || it.name.toLowerCase() === q,
      ) ?? null
    );
  }, [scan, activeItems]);

  const filteredItems = useMemo(() => {
    let list = activeItems;
    if (catFilter === 'none') list = list.filter((it) => !it.categoryId);
    else if (catFilter !== 'all') list = list.filter((it) => it.categoryId === catFilter);
    if (filterLow) {
      const lowIds = new Set(low.map((x) => x.id));
      list = list.filter((it) => lowIds.has(it.id) || healthOf(snap.byItem.get(it.id)?.qty ?? 0, it.minQty) !== 'ok');
    }
    const q = scan.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (it) =>
          it.name.toLowerCase().includes(q) ||
          it.sku.toLowerCase().includes(q) ||
          (it.barcode ?? '').toLowerCase().includes(q) ||
          (it.brand ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [activeItems, catFilter, filterLow, low, scan, snap]);

  const removeItem = async (it: StockItem) => {
    const ok = await confirm({
      title: `Hapus ${it.name}?`,
      message: 'Semua mutasi dan batch barang ini ikut dihapus.',
      confirmLabel: 'Hapus',
      tone: 'danger',
    });
    if (!ok) return;
    const hid = deleteStockItem(it.id);
    if (hid) notify(`${it.name} dihapus`, hid, { tone: 'danger' });
    setDetail(null);
  };

  const openMove = (type: StockMoveType, itemId?: string) => {
    setDetail(null);
    setMoveModal({ type, itemId });
  };

  return (
    <div className="stock-page">
      <PageHeader
        title="Persediaan"
        subtitle="Stok barang dengan jurnal perpetual (rata-rata tertimbang)"
        actions={
          <div className="row stock-head-actions" style={{ gap: 8, flexWrap: 'wrap' }}>
            {narrow ? (
              <Menu
                items={[
                  { label: 'Masuk stok', icon: Download, onSelect: () => openMove('in') },
                  { label: 'Keluar stok', icon: Upload, onSelect: () => openMove('out') },
                  { label: 'Opname', icon: Scale, onSelect: () => openMove('adjust') },
                ]}
                trigger={(p) => (
                  <Button variant="ghost" ref={p.ref} onClick={p.onClick} aria-expanded={p['aria-expanded']} aria-haspopup={p['aria-haspopup']}>
                    Mutasi
                  </Button>
                )}
              />
            ) : (
              <>
                <Button variant="ghost" icon={Download} onClick={() => openMove('in')}>
                  Masuk
                </Button>
                <Button variant="ghost" icon={Upload} onClick={() => openMove('out')}>
                  Keluar
                </Button>
              </>
            )}
            <Button variant="primary" icon={Plus} onClick={() => setItemModal({})}>
              Tambah barang
            </Button>
          </div>
        }
      />

      <div className="sum-strip big">
        <div>
          <span>Nilai persediaan</span>
          <Money value={value} />
        </div>
        <div>
          <span>SKU aktif</span>
          <strong className="num money-val">{activeItems.length}</strong>
        </div>
        <div
          role="button"
          tabIndex={0}
          className={filterLow ? 'stock-kpi-on' : undefined}
          aria-pressed={filterLow}
          onClick={() => {
            setTab('items');
            setFilterLow((v) => !v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setTab('items');
              setFilterLow((v) => !v);
            }
          }}
        >
          <span>Stok rendah</span>
          <strong className={`num money-val ${low.length ? 'neg' : ''}`}>{low.length}</strong>
        </div>
        <div>
          <span>Mutasi</span>
          <strong className="num money-val">{data.stockMoves.length}</strong>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Segmented
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={[
            { value: 'items', label: 'Barang' },
            { value: 'moves', label: 'Mutasi' },
            { value: 'locations', label: 'Lokasi' },
            { value: 'orders', label: 'Pesanan' },
          ]}
        />
      </div>

      {tab === 'items' && (
        <div className="card">
          {activeItems.length > 0 && (
            <div className="list-toolbar">
              <div className="lt-row">
                <div className="fb-search grow">
                  <TextInput
                    value={scan}
                    onChange={setScan}
                    icon={Search}
                    placeholder="Cari nama, SKU, atau barcode…"
                    clearable
                    sunken
                    aria-label="Cari barang"
                  />
                </div>
                {matchedScan && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      openMove('out', matchedScan.id);
                      setScan('');
                    }}
                  >
                    Keluar
                  </Button>
                )}
              </div>
              <div className="lt-row stock-cat-chips" role="toolbar" aria-label="Filter kategori">
                <button type="button" className={`chip${catFilter === 'all' ? ' on' : ''}`} onClick={() => setCatFilter('all')}>
                  Semua
                </button>
                <button type="button" className={`chip${catFilter === 'none' ? ' on' : ''}`} onClick={() => setCatFilter('none')}>
                  Tanpa kategori
                </button>
                {cats.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`chip${catFilter === c.id ? ' on' : ''}`}
                    onClick={() => setCatFilter(c.id)}
                    style={{ '--cc': c.color } as React.CSSProperties}
                  >
                    <IconTile icon={c.icon} color={c.color} size="xs" round />
                    {c.name}
                  </button>
                ))}
                {filterLow && (
                  <button type="button" className="chip on" onClick={() => setFilterLow(false)}>
                    Stok rendah ×
                  </button>
                )}
                <button type="button" className="chip" onClick={() => setCatModal(true)}>
                  <Plus /> Kategori
                </button>
              </div>
            </div>
          )}
          {activeItems.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Belum ada barang"
              text="Tambah barang dengan kategori dan harga, lalu catat masuk stok."
              action={
                <Button variant="primary" icon={Plus} onClick={() => setItemModal({})}>
                  Tambah barang
                </Button>
              }
            />
          ) : filteredItems.length === 0 ? (
            <EmptyState icon={Search} title="Tidak ada hasil" text="Ubah filter atau kata pencarian." />
          ) : (
            <TableWrap label="Daftar barang">
              <table className="table table-responsive-cards">
                <thead>
                  <tr>
                    <th>Barang</th>
                    <th>SKU</th>
                    <th className="r">Qty</th>
                    <th className="r">Nilai</th>
                    <th>Status</th>
                    <th style={{ width: 48 }} />
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((it) => {
                    const st = snap.byItem.get(it.id);
                    const qty = st?.qty ?? 0;
                    const val = st?.value ?? 0;
                    const h = healthOf(qty, it.minQty);
                    const cat = it.categoryId ? catMap.get(it.categoryId) : undefined;
                    const m = marginPct(it.costPrice, it.sellPrice);
                    return (
                      <tr key={it.id} className="clickable" {...rowAction(() => setDetail(it))}>
                        <td data-label="Barang">
                          <div className="row">
                            <IconTile icon={cat?.icon ?? 'package'} color={cat?.color ?? '#8A6546'} size="sm" />
                            <div className="col" style={{ minWidth: 0 }}>
                              <strong className="truncate" style={{ maxWidth: 220 }}>
                                {it.name}
                              </strong>
                              <span className="muted" style={{ fontSize: 12 }}>
                                {cat ? `${cat.name} · ` : ''}
                                {it.brand ? `${it.brand} · ` : ''}
                                {it.unit}
                                {m !== null ? ` · margin ${m.toFixed(0)}%` : ''}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td data-label="SKU">
                          <span className="mono">{it.sku || it.barcode || '—'}</span>
                        </td>
                        <td className="r num" data-label="Qty">
                          {qty} {it.unit}
                        </td>
                        <td className="r num money-val" data-label="Nilai">
                          <strong>{formatMoney(val, { symbol: false })}</strong>
                        </td>
                        <td data-label="Status">
                          {h === 'out' ? (
                            <Badge tone="neg" dot>
                              Habis
                            </Badge>
                          ) : h === 'low' ? (
                            <Badge tone="warn" dot>
                              Rendah
                            </Badge>
                          ) : (
                            <Badge tone="pos" dot>
                              Aman
                            </Badge>
                          )}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <Menu
                            items={[
                              { label: 'Masuk stok', icon: Download, onSelect: () => openMove('in', it.id) },
                              { label: 'Keluar stok', icon: Upload, onSelect: () => openMove('out', it.id) },
                              { label: 'Opname', icon: Scale, onSelect: () => openMove('adjust', it.id) },
                              { label: 'Transfer', icon: ArrowLeftRight, onSelect: () => openMove('transfer', it.id) },
                              { separator: true },
                              { label: 'Ubah', icon: Pencil, onSelect: () => setItemModal({ editing: it }) },
                              { label: 'Hapus', icon: Trash2, danger: true, onSelect: () => removeItem(it) },
                            ]}
                            trigger={(p) => (
                              <button type="button" className="tb-btn" ref={p.ref} onClick={p.onClick} aria-expanded={p['aria-expanded']} aria-haspopup={p['aria-haspopup']} aria-label="Menu">
                                <Ellipsis />
                              </button>
                            )}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          )}
        </div>
      )}

      {tab === 'moves' && (
        <div className="card">
          {data.stockMoves.length === 0 ? (
            <EmptyState
              icon={NotebookPen}
              title="Belum ada mutasi"
              text="Catat masuk, keluar, opname, atau transfer antar lokasi."
              action={
                <Button variant="primary" icon={Download} onClick={() => openMove('in')}>
                  Masuk stok
                </Button>
              }
            />
          ) : (
            <TableWrap label="Mutasi stok">
              <table className="table table-responsive-cards">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Jenis</th>
                    <th>Barang</th>
                    <th className="r">Qty</th>
                    <th className="r">Biaya</th>
                    <th>Bukti</th>
                    <th style={{ width: 48 }} />
                  </tr>
                </thead>
                <tbody>
                  {[...data.stockMoves]
                    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt))
                    .map((m) => {
                      const it = data.stockItems.find((x) => x.id === m.itemId);
                      const label =
                        m.type === 'in' ? 'Masuk' : m.type === 'out' ? 'Keluar' : m.type === 'adjust' ? (m.adjustSign === -1 ? 'Opname −' : 'Opname +') : 'Transfer';
                      return (
                        <tr key={m.id}>
                          <td data-label="Tanggal">{formatDate(m.date)}</td>
                          <td data-label="Jenis">
                            <Badge>{label}</Badge>
                          </td>
                          <td data-label="Barang">{it?.name ?? '—'}</td>
                          <td className="r num" data-label="Qty">
                            {m.qty} {it?.unit ?? ''}
                          </td>
                          <td className="r num money-val" data-label="Biaya">
                            {m.unitCost !== undefined ? formatMoney(m.unitCost, { symbol: false }) : '—'}
                          </td>
                          <td data-label="Bukti">
                            <span className="mono muted">{m.ref}</span>
                          </td>
                          <td>
                            <Menu
                              items={[
                                {
                                  label: 'Hapus',
                                  icon: Trash2,
                                  danger: true,
                                  onSelect: async () => {
                                    const ok = await confirm({ title: `Hapus ${m.ref}?`, message: 'Jurnal terkait ikut hilang.', confirmLabel: 'Hapus', tone: 'danger' });
                                    if (!ok) return;
                                    const hid = deleteStockMove(m.id);
                                    if (hid) notify('Mutasi dihapus', hid, { tone: 'danger' });
                                  },
                                },
                              ]}
                              trigger={(p) => (
                                <button type="button" className="tb-btn" ref={p.ref} onClick={p.onClick} aria-label="Menu">
                                  <Ellipsis />
                                </button>
                              )}
                            />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </TableWrap>
          )}
        </div>
      )}

      {tab === 'locations' && (
        <div className="card">
          {data.stockLocations.filter((l) => !l.archived).length === 0 ? (
            <EmptyState
              icon={Building2}
              title="Belum ada lokasi"
              text="Tambah gudang atau rak penyimpanan."
              action={
                <Button variant="primary" icon={Plus} onClick={() => setLocModal(true)}>
                  Tambah lokasi
                </Button>
              }
            />
          ) : (
            <>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
                <span className="muted">Gudang / lokasi penyimpanan</span>
                <Button variant="ghost" icon={Plus} onClick={() => setLocModal(true)}>
                  Tambah
                </Button>
              </div>
              <TableWrap label="Lokasi stok">
                <table className="table table-responsive-cards">
                  <thead>
                    <tr>
                      <th>Nama</th>
                      <th className="r">SKU dengan stok</th>
                      <th style={{ width: 48 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {data.stockLocations
                      .filter((l) => !l.archived)
                      .map((l) => {
                        let n = 0;
                        for (const it of activeItems) if (itemQty(snap, it.id, l.id) > 0.0005) n++;
                        return (
                          <tr key={l.id}>
                            <td data-label="Nama">
                              <div className="row">
                                <IconTile icon={Building2} color="#3B6A96" size="sm" />
                                <strong>
                                  {l.name}
                                  {l.id === DEFAULT_LOCATION_ID ? ' (default)' : ''}
                                </strong>
                              </div>
                            </td>
                            <td className="r num" data-label="SKU dengan stok">
                              {n}
                            </td>
                            <td>
                              {l.id !== DEFAULT_LOCATION_ID && (
                                <Menu
                                  items={[
                                    {
                                      label: 'Hapus',
                                      icon: Trash2,
                                      danger: true,
                                      onSelect: async () => {
                                        const hid = deleteStockLocation(l.id);
                                        if (!hid) {
                                          toast('Lokasi masih dipakai mutasi/PO', { tone: 'danger' });
                                          return;
                                        }
                                        notify('Lokasi dihapus', hid, { tone: 'danger' });
                                      },
                                    },
                                  ]}
                                  trigger={(p) => (
                                    <button type="button" className="tb-btn" ref={p.ref} onClick={p.onClick} aria-label="Menu">
                                      <Ellipsis />
                                    </button>
                                  )}
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </TableWrap>
            </>
          )}
        </div>
      )}

      {tab === 'orders' && (
        <div className="card">
          {data.purchaseOrders.length === 0 ? (
            <EmptyState
              icon={NotebookPen}
              title="Belum ada PO"
              text="Buat pesanan multi-baris ke pemasok, lalu terima barang untuk menambah stok."
              action={
                <Button variant="primary" icon={Plus} onClick={() => setPoModal(true)} disabled={!activeItems.length}>
                  Buat PO
                </Button>
              }
            />
          ) : (
            <>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
                <span className="muted">Pesanan pembelian (PO)</span>
                <Button variant="primary" icon={Plus} onClick={() => setPoModal(true)} disabled={!activeItems.length}>
                  Buat PO
                </Button>
              </div>
              <TableWrap label="Pesanan pembelian">
                <table className="table table-responsive-cards">
                  <thead>
                    <tr>
                      <th>Bukti</th>
                      <th>Tanggal</th>
                      <th>Pemasok</th>
                      <th>Status</th>
                      <th className="r">Baris</th>
                      <th style={{ width: 48 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {data.purchaseOrders.map((p) => (
                      <tr key={p.id}>
                        <td data-label="Bukti">
                          <span className="mono">{p.ref}</span>
                        </td>
                        <td data-label="Tanggal">{formatDate(p.date)}</td>
                        <td data-label="Pemasok">{p.supplier || '—'}</td>
                        <td data-label="Status">
                          <Badge tone={p.status === 'received' ? 'pos' : p.status === 'cancelled' ? undefined : 'warn'}>{p.status}</Badge>
                        </td>
                        <td className="r num" data-label="Baris">
                          {p.lines.length}
                        </td>
                        <td>
                          <Menu
                            items={[
                              ...(p.status !== 'received' && p.status !== 'cancelled'
                                ? [
                                    { label: 'Terima barang…', icon: Download, onSelect: () => setReceivePo(p) },
                                    {
                                      label: 'Tandai dipesan',
                                      icon: NotebookPen,
                                      onSelect: () => {
                                        const hid = updatePurchaseOrder(p.id, { status: 'ordered' });
                                        if (hid) notify('PO dipesan', hid);
                                      },
                                    },
                                  ]
                                : []),
                              {
                                label: 'Batalkan',
                                icon: Trash2,
                                danger: true,
                                onSelect: () => {
                                  const hid = updatePurchaseOrder(p.id, { status: 'cancelled' }, 'Batalkan PO');
                                  if (hid) notify('PO dibatalkan', hid, { tone: 'danger' });
                                },
                              },
                              {
                                label: 'Hapus',
                                icon: Trash2,
                                danger: true,
                                onSelect: async () => {
                                  const ok = await confirm({ title: `Hapus ${p.ref}?`, confirmLabel: 'Hapus', tone: 'danger' });
                                  if (!ok) return;
                                  const hid = deletePurchaseOrder(p.id);
                                  if (hid) notify('PO dihapus', hid, { tone: 'danger' });
                                },
                              },
                            ]}
                            trigger={(pr) => (
                              <button type="button" className="tb-btn" ref={pr.ref} onClick={pr.onClick} aria-label="Menu">
                                <Ellipsis />
                              </button>
                            )}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </>
          )}
        </div>
      )}

      {detail && (
        <ItemDetailSheet
          item={detail}
          snap={snap}
          catName={detail.categoryId ? catMap.get(detail.categoryId)?.name : undefined}
          locations={data.stockLocations.filter((l) => !l.archived)}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setItemModal({ editing: detail });
            setDetail(null);
          }}
          onMove={(t) => openMove(t, detail.id)}
          onDelete={() => removeItem(detail)}
        />
      )}
      {itemModal && (
        <ItemModal
          editing={itemModal.editing}
          onClose={() => setItemModal(null)}
          onManageCategories={() => setCatModal(true)}
        />
      )}
      {moveModal && (
        <StockMoveModal initialType={moveModal.type} itemId={moveModal.itemId} onClose={() => setMoveModal(null)} />
      )}
      {catModal && <StockCategoryModal onClose={() => setCatModal(false)} />}
      {locModal && <LocationModal onClose={() => setLocModal(false)} />}
      {poModal && <PoModal onClose={() => setPoModal(false)} />}
      {receivePo && <ReceiveModal po={receivePo} onClose={() => setReceivePo(null)} />}
    </div>
  );
}

function ItemDetailSheet({
  item,
  snap,
  catName,
  locations,
  onClose,
  onEdit,
  onMove,
  onDelete,
}: {
  item: StockItem;
  snap: ReturnType<typeof computeStock>;
  catName?: string;
  locations: { id: string; name: string }[];
  onClose: () => void;
  onEdit: () => void;
  onMove: (t: StockMoveType) => void;
  onDelete: () => void;
}) {
  const st = snap.byItem.get(item.id);
  const qty = st?.qty ?? 0;
  const m = marginPct(item.costPrice, item.sellPrice);
  const h = healthOf(qty, item.minQty);
  return (
    <Modal
      open
      title={item.name}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onEdit}>
            Ubah
          </Button>
          <Button variant="primary" onClick={() => onMove('in')}>
            Masuk
          </Button>
        </>
      }
    >
      <div className="stock-detail">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {h === 'out' ? (
            <Badge tone="neg" dot>
              Habis
            </Badge>
          ) : h === 'low' ? (
            <Badge tone="warn" dot>
              Stok rendah
            </Badge>
          ) : (
            <Badge tone="pos" dot>
              Aman
            </Badge>
          )}
          {catName && <Badge>{catName}</Badge>}
          {item.brand && <Badge>{item.brand}</Badge>}
        </div>
        <dl className="stock-detail-grid">
          <div>
            <dt>Qty total</dt>
            <dd>
              {qty} {item.unit}
            </dd>
          </div>
          <div>
            <dt>Nilai</dt>
            <dd>{formatMoney(st?.value ?? 0)}</dd>
          </div>
          <div>
            <dt>Harga beli</dt>
            <dd>{item.costPrice != null ? formatMoney(item.costPrice) : '—'}</dd>
          </div>
          <div>
            <dt>Harga jual</dt>
            <dd>
              {item.sellPrice != null ? formatMoney(item.sellPrice) : '—'}
              {m !== null ? ` (${m.toFixed(0)}%)` : ''}
            </dd>
          </div>
          <div>
            <dt>SKU</dt>
            <dd className="mono">{item.sku || '—'}</dd>
          </div>
          <div>
            <dt>Barcode</dt>
            <dd className="mono">{item.barcode || '—'}</dd>
          </div>
        </dl>
        {item.description && <p className="muted stock-detail-desc">{item.description}</p>}
        <div className="label-caps" style={{ marginTop: 12 }}>
          Per lokasi
        </div>
        <ul className="stock-loc-list">
          {locations.map((l) => {
            const q = itemQty(snap, item.id, l.id);
            if (q <= 0.0005 && locations.length > 3) return null;
            return (
              <li key={l.id}>
                <span>{l.name}</span>
                <strong className="num">
                  {q} {item.unit}
                </strong>
              </li>
            );
          })}
        </ul>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
          <Button size="sm" variant="ghost" icon={Upload} onClick={() => onMove('out')}>
            Keluar
          </Button>
          <Button size="sm" variant="ghost" icon={Scale} onClick={() => onMove('adjust')}>
            Opname
          </Button>
          <Button size="sm" variant="ghost" icon={Trash2} onClick={onDelete}>
            Hapus
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ItemModal({
  editing,
  onClose,
  onManageCategories,
}: {
  editing?: StockItem;
  onClose: () => void;
  onManageCategories: () => void;
}) {
  const data = useData((s) => s.data);
  const cats = data.stockCategories ?? [];
  const [name, setName] = useState(editing?.name ?? '');
  const [sku, setSku] = useState(editing?.sku ?? '');
  const [barcode, setBarcode] = useState(editing?.barcode ?? '');
  const unitInit = editing?.unit && (UNIT_PRESETS as readonly string[]).includes(editing.unit) ? editing.unit : editing?.unit ? UNIT_OTHER : 'pcs';
  const [unitSel, setUnitSel] = useState(unitInit);
  const [unitCustom, setUnitCustom] = useState(unitInit === UNIT_OTHER ? editing?.unit ?? '' : '');
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '');
  const [brand, setBrand] = useState(editing?.brand ?? '');
  const [cost, setCost] = useState<number | null>(editing?.costPrice ?? null);
  const [sell, setSell] = useState<number | null>(editing?.sellPrice ?? null);
  const [minQty, setMinQty] = useState(String(editing?.minQty ?? 0));
  const [reorderQty, setReorderQty] = useState(String(editing?.reorderQty ?? ''));
  const [trackBatch, setTrackBatch] = useState(!!editing?.trackBatch);
  const [description, setDescription] = useState(editing?.description ?? '');
  const [tried, setTried] = useState(false);
  const errs = { name: !name.trim() ? 'Nama wajib' : null };
  const m = marginPct(cost ?? undefined, sell ?? undefined);

  const submit = () => {
    setTried(true);
    if (errs.name) return;
    const catId = categoryId || undefined;
    const unit = unitSel === UNIT_OTHER ? unitCustom.trim() || 'pcs' : unitSel;
    const payload = {
      name: name.trim(),
      sku: sku.trim(),
      barcode: barcode.trim() || undefined,
      brand: brand.trim() || undefined,
      unit,
      categoryId: catId,
      minQty: Math.max(0, round2(Number(minQty) || 0)),
      reorderQty: reorderQty.trim() ? Math.max(0, round2(Number(reorderQty) || 0)) : undefined,
      costPrice: cost ?? undefined,
      sellPrice: sell ?? undefined,
      description: description.trim() || undefined,
      inventoryAccountId: editing?.inventoryAccountId || SYS.inventory,
      cogsAccountId: editing?.cogsAccountId || SYS.cogs,
      trackBatch: trackBatch || undefined,
    };
    if (editing) {
      const hid = updateStockItem(editing.id, { ...payload, categoryId: catId ?? '' });
      if (hid) notify('Barang disimpan', hid);
    } else {
      const { historyId } = addStockItem(payload);
      if (historyId) notify('Barang ditambah', historyId);
    }
    onClose();
  };
  const submitRef = useSubmitRef(submit);

  return (
    <Modal
      open
      title={editing ? 'Ubah barang' : 'Barang baru'}
      subtitle="Katalog stok — harga beli dipakai default saat masuk barang"
      onClose={onClose}
      size="lg"
      footer={
        <>
          {m !== null && <span className="hint">Margin {m.toFixed(0)}%</span>}
          <span className="spacer" />
          <Button onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={() => submitRef.run()}>
            {editing ? 'Simpan' : 'Tambahkan barang'}
          </Button>
        </>
      }
    >
      <div
        className="tx-grid"
        style={{ marginTop: 4 }}
        data-form
        onKeyDown={(e) => {
          if (!isImeComposing(e) && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submitRef.runFrom(e.target);
          }
        }}
      >
        <Field label="Nama barang" error={tried && errs.name} className="span-2">
          <TextInput value={name} onChange={setName} autoFocus placeholder="mis. Teh botol 350 ml" data-field invalid={tried && !!errs.name} />
        </Field>
        <Field label="SKU" optional>
          <TextInput value={sku} onChange={setSku} placeholder="Kode unik" data-field />
        </Field>
        <Field label="Barcode" optional>
          <TextInput value={barcode} onChange={setBarcode} placeholder="Terpisah dari SKU" data-field />
        </Field>
        <Field label="Satuan">
          <Select
            value={unitSel}
            onChange={setUnitSel}
            options={[...UNIT_PRESETS.map((u) => ({ value: u, label: u })), { value: UNIT_OTHER, label: 'Lainnya…' }]}
          />
        </Field>
        {unitSel === UNIT_OTHER ? (
          <Field label="Satuan kustom">
            <TextInput value={unitCustom} onChange={setUnitCustom} placeholder="mis. roll" data-field />
          </Field>
        ) : (
          <Field label="Merk / brand" optional>
            <TextInput value={brand} onChange={setBrand} placeholder="Opsional" data-field />
          </Field>
        )}
        {unitSel === UNIT_OTHER && (
          <Field label="Merk / brand" optional className="span-2">
            <TextInput value={brand} onChange={setBrand} placeholder="Opsional" data-field />
          </Field>
        )}
        <Field label="Kategori" optional className="span-2">
          <div className="row" style={{ gap: 8, alignItems: 'stretch' }}>
            <div className="grow" style={{ minWidth: 0 }}>
              <Select
                value={categoryId}
                onChange={setCategoryId}
                options={[
                  { value: '', label: 'Tanpa kategori' },
                  ...cats.map((c) => ({ value: c.id, label: c.name, icon: c.icon, color: c.color })),
                ]}
              />
            </div>
            <Button type="button" onClick={onManageCategories}>
              Kelola
            </Button>
          </div>
        </Field>
        <Field label="Harga beli (modal)" optional>
          <AmountInput variant="inline" value={cost} onChange={setCost} />
        </Field>
        <Field label="Harga jual" optional>
          <AmountInput variant="inline" value={sell} onChange={setSell} />
        </Field>
        <Field label="Stok minimum" optional>
          <TextInput value={minQty} onChange={setMinQty} inputMode="decimal" data-field className="num" />
        </Field>
        <Field label="Qty reorder" optional>
          <TextInput value={reorderQty} onChange={setReorderQty} inputMode="decimal" placeholder="0" data-field className="num" />
        </Field>
        <Field label="Lacak batch / kadaluarsa" className="span-2" hint="Aktifkan bila barang punya nomor lot atau tanggal kedaluwarsa.">
          <Switch checked={trackBatch} onChange={setTrackBatch} label="Lacak batch" />
        </Field>
        <Field label="Deskripsi" optional className="span-2">
          <TextArea value={description} onChange={setDescription} rows={2} placeholder="Opsional" />
        </Field>
      </div>
    </Modal>
  );
}

function LocationModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const submit = () => {
    if (!name.trim()) return;
    const { historyId } = addStockLocation(name);
    if (historyId) notify('Lokasi ditambah', historyId);
    onClose();
  };
  return (
    <Modal
      open
      title="Tambah lokasi"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button variant="primary" onClick={submit}>
            Simpan
          </Button>
        </>
      }
    >
      <Field label="Nama lokasi">
        <TextInput value={name} onChange={setName} autoFocus placeholder="Gudang cabang…" />
      </Field>
    </Modal>
  );
}

type PoLineDraft = { key: string; itemId: string; qty: number | null; unitCost: number | null };

function PoModal({ onClose }: { onClose: () => void }) {
  const data = useData((s) => s.data);
  const today = useToday();
  const items = data.stockItems.filter((it) => !it.archived);
  const itemOpts = items.map((it) => ({ value: it.id, label: it.name, sub: it.sku }));
  const locs = data.stockLocations.filter((l) => !l.archived).map((l) => ({ value: l.id, label: l.name }));
  const [date, setDate] = useState(today);
  const [supplier, setSupplier] = useState('');
  const [locationId, setLocationId] = useState(DEFAULT_LOCATION_ID);
  const [lines, setLines] = useState<PoLineDraft[]>(() => [
    { key: '1', itemId: items[0]?.id ?? '', qty: null, unitCost: items[0]?.costPrice ?? null },
  ]);
  const [tried, setTried] = useState(false);

  const setLine = (key: string, patch: Partial<PoLineDraft>) =>
    setLines((rows) =>
      rows.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        if (patch.itemId) {
          const it = items.find((x) => x.id === patch.itemId);
          if (it?.costPrice != null && !(r.unitCost && r.unitCost > 0)) next.unitCost = it.costPrice;
        }
        return next;
      }),
    );

  const submit = () => {
    setTried(true);
    const clean = lines
      .filter((l) => l.itemId && l.qty && l.qty > 0 && l.unitCost && l.unitCost > 0)
      .map((l) => ({ itemId: l.itemId, qty: l.qty!, unitCost: l.unitCost!, receivedQty: 0 }));
    if (!clean.length) return;
    const { historyId } = addPurchaseOrder({
      date,
      supplier: supplier.trim() || undefined,
      status: 'ordered',
      locationId,
      lines: clean,
    });
    if (historyId) notify('PO dibuat', historyId);
    onClose();
  };

  return (
    <Modal
      open
      title="Pesanan pembelian"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button variant="primary" onClick={submit}>
            Simpan
          </Button>
        </>
      }
    >
      <div className="tx-grid" style={{ marginTop: 4 }}>
        <Field label="Tanggal">
          <DatePicker value={date} onChange={setDate} />
        </Field>
        <Field label="Pemasok" optional>
          <TextInput value={supplier} onChange={setSupplier} data-field />
        </Field>
        <Field label="Lokasi terima" className="span-2">
          <Select value={locationId} onChange={setLocationId} options={locs} />
        </Field>
        <div className="span-2">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="label-caps" style={{ margin: 0 }}>
              Baris barang
            </span>
            <Button
              size="sm"
              variant="ghost"
              icon={Plus}
              onClick={() =>
                setLines((rows) => [
                  ...rows,
                  { key: String(Date.now()), itemId: items[0]?.id ?? '', qty: null, unitCost: items[0]?.costPrice ?? null },
                ])
              }
            >
              Tambah baris
            </Button>
          </div>
          {lines.map((l, i) => (
            <div key={l.key} className="stock-po-line">
              <Field label={`Barang ${i + 1}`} error={tried && !l.itemId ? 'Wajib' : null}>
                <Select value={l.itemId} onChange={(v) => setLine(l.key, { itemId: v })} options={itemOpts} />
              </Field>
              <Field label="Qty" error={tried && !(l.qty && l.qty > 0) ? 'Wajib' : null}>
                <AmountInput variant="inline" value={l.qty} onChange={(v) => setLine(l.key, { qty: v })} />
              </Field>
              <Field label="Harga" error={tried && !(l.unitCost && l.unitCost > 0) ? 'Wajib' : null}>
                <AmountInput variant="inline" value={l.unitCost} onChange={(v) => setLine(l.key, { unitCost: v })} />
              </Field>
              {lines.length > 1 && (
                <button type="button" className="tb-btn" aria-label="Hapus baris" onClick={() => setLines((rows) => rows.filter((r) => r.key !== l.key))}>
                  <Trash2 />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function ReceiveModal({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  const today = useToday();
  const wallets = useWalletOptions(false);
  const data = useData((s) => s.data);
  const [date, setDate] = useState(today);
  const [funding, setFunding] = useState<StockFunding>('wallet');
  const [wallet, setWallet] = useState(wallets[0]?.value ?? SYS.cash);
  const [qtys, setQtys] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(po.lines.map((l) => [l.itemId, round2(Math.max(0, l.qty - l.receivedQty)) || null])),
  );

  const submit = () => {
    const receipts = po.lines
      .map((l) => ({ itemId: l.itemId, qty: qtys[l.itemId] ?? 0 }))
      .filter((r) => r.qty > 0);
    const hid = receivePurchaseOrder(po.id, receipts, {
      date,
      funding,
      walletAccountId: funding === 'wallet' ? wallet : undefined,
      payableAccountId: funding === 'payable' ? SYS.payable : undefined,
    });
    if (hid) notify('Barang diterima', hid);
    onClose();
  };

  return (
    <Modal
      open
      title={`Terima ${po.ref}`}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button variant="primary" onClick={submit}>
            Terima
          </Button>
        </>
      }
    >
      <div className="tx-grid" style={{ marginTop: 4 }}>
        <Field label="Tanggal terima">
          <DatePicker value={date} onChange={setDate} />
        </Field>
        <Field label="Pembayaran">
          <Segmented
            block
            size="sm"
            value={funding}
            onChange={(v) => setFunding(v as StockFunding)}
            options={[
              { value: 'wallet', label: 'Kas/bank' },
              { value: 'payable', label: 'Hutang' },
              { value: 'opening', label: 'Saldo awal' },
            ]}
          />
        </Field>
        {funding === 'wallet' && (
          <Field label="Dompet" className="span-2">
            <Select value={wallet} onChange={setWallet} options={wallets} />
          </Field>
        )}
        {po.lines.map((l) => {
          const it = data.stockItems.find((x) => x.id === l.itemId);
          const remain = round2(Math.max(0, l.qty - l.receivedQty));
          return (
            <Field key={l.itemId} label={`${it?.name ?? l.itemId} (sisa ${remain})`} className="span-2">
              <AmountInput variant="inline" value={qtys[l.itemId] ?? null} onChange={(v) => setQtys((s) => ({ ...s, [l.itemId]: v }))} />
            </Field>
          );
        })}
      </div>
    </Modal>
  );
}
