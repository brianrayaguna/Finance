import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Download, Upload, Scale, ArrowLeftRight, Plus } from '../../lib/glyphs';
import { SYS } from '../../accounting/coa';
import { isLocked } from '../../accounting/lock';
import { DEFAULT_LOCATION_ID } from '../../accounting/stock';
import type { StockFunding, StockMove, StockMoveType } from '../../accounting/types';
import { addStockMove, useData } from '../../store/data';
import { notify } from '../../store/history';
import { formatDate, formatMoney } from '../../lib/format';
import { useSubmitRef } from '../../lib/focus';
import { isImeComposing } from '../../lib/layers';
import { useToday } from '../../hooks/useApp';
import { Modal } from '../ui/Modal';
import { Segmented } from '../ui/Segmented';
import { AmountInput } from '../ui/AmountInput';
import { Select } from '../ui/Select';
import { DatePicker } from '../ui/DatePicker';
import { Button, Field, IconTile, TextInput } from '../ui/primitives';
import { useWalletOptions } from './options';

const MODES: { value: StockMoveType; label: string; icon: typeof Download }[] = [
  { value: 'in', label: 'Masuk', icon: Download },
  { value: 'out', label: 'Keluar', icon: Upload },
  { value: 'adjust', label: 'Opname', icon: Scale },
  { value: 'transfer', label: 'Transfer', icon: ArrowLeftRight },
];

function modeTitle(type: StockMoveType) {
  return MODES.find((m) => m.value === type)?.label ?? 'Mutasi';
}

export function StockMoveModal({
  initialType = 'in',
  itemId,
  onClose,
}: {
  initialType?: StockMoveType;
  itemId?: string;
  onClose: () => void;
}) {
  const data = useData((s) => s.data);
  const today = useToday();
  const lockDate = data.profile.lockDate;
  const wallets = useWalletOptions(false);
  const cats = useMemo(() => new Map((data.stockCategories ?? []).map((c) => [c.id, c])), [data.stockCategories]);
  const activeItems = useMemo(() => data.stockItems.filter((it) => !it.archived), [data.stockItems]);
  const itemOpts = activeItems.map((it) => {
    const cat = it.categoryId ? cats.get(it.categoryId) : undefined;
    return { value: it.id, label: it.name, sub: it.sku || it.unit, icon: cat?.icon, color: cat?.color };
  });
  const locs = data.stockLocations.filter((l) => !l.archived).map((l) => ({ value: l.id, label: l.name }));

  const frequent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of data.stockMoves) counts.set(m.itemId, (counts.get(m.itemId) ?? 0) + 1);
    return [...activeItems]
      .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || b.createdAt - a.createdAt)
      .slice(0, 6);
  }, [activeItems, data.stockMoves]);

  const [type, setType] = useState<StockMoveType>(initialType);
  const [item, setItem] = useState(itemId ?? activeItems[0]?.id ?? '');
  const [date, setDate] = useState(today);
  const [qty, setQty] = useState<number | null>(null);
  const selected = activeItems.find((x) => x.id === item);
  const [unitCost, setUnitCost] = useState<number | null>(selected?.costPrice ?? null);
  const [funding, setFunding] = useState<StockFunding>(initialType === 'in' ? 'wallet' : 'none');
  const [wallet, setWallet] = useState(wallets[0]?.value ?? SYS.cash);
  const [locationId, setLocationId] = useState(DEFAULT_LOCATION_ID);
  const [toLocationId, setToLocationId] = useState(locs.find((l) => l.value !== DEFAULT_LOCATION_ID)?.value ?? locs[0]?.value ?? '');
  const [adjustSign, setAdjustSign] = useState<1 | -1>(1);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const qtyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (type !== 'in') return;
    const it = activeItems.find((x) => x.id === item);
    if (it?.costPrice != null && it.costPrice > 0) setUnitCost(it.costPrice);
  }, [item, type, activeItems]);

  useEffect(() => {
    if (type === 'in' && funding === 'none') setFunding('wallet');
  }, [type, funding]);

  const dateLock = isLocked(date, lockDate);
  const errs = {
    item: !item ? 'Pilih barang' : null,
    qty: !qty || qty <= 0 ? 'Qty harus > 0' : null,
    cost: type === 'in' && funding !== 'none' && !(unitCost && unitCost > 0) ? 'Harga satuan wajib' : null,
    date: dateLock ? `Periode sampai ${formatDate(lockDate!)} sudah dikunci` : null,
    transfer: type === 'transfer' && (!toLocationId || toLocationId === locationId) ? 'Pilih lokasi tujuan berbeda' : null,
  };

  const resetForm = () => {
    setQty(null);
    setNote('');
    setTried(false);
    setAdjustSign(1);
    const it = activeItems.find((x) => x.id === item);
    setUnitCost(it?.costPrice ?? null);
    requestAnimationFrame(() => qtyRef.current?.focus());
  };

  const submit = (mode: 'close' | 'new') => {
    setTried(true);
    if (Object.values(errs).some(Boolean)) return;
    const payload: Omit<StockMove, 'id' | 'ref' | 'createdAt'> = {
      date,
      type,
      itemId: item,
      locationId,
      toLocationId: type === 'transfer' ? toLocationId : undefined,
      qty: qty!,
      unitCost: type === 'in' || (type === 'adjust' && adjustSign === 1) ? unitCost ?? undefined : undefined,
      funding: type === 'in' ? funding : 'none',
      walletAccountId: type === 'in' && funding === 'wallet' ? wallet : undefined,
      payableAccountId: type === 'in' && funding === 'payable' ? SYS.payable : undefined,
      adjustSign: type === 'adjust' ? adjustSign : undefined,
      note: note.trim() || undefined,
    };
    const { historyId } = addStockMove(payload);
    if (historyId) notify(`${modeTitle(type)} stok`, historyId);
    if (mode === 'new') resetForm();
    else onClose();
  };
  const submitRef = useSubmitRef((m?: 'close' | 'new') => submit(m ?? 'close'));

  const switchType = (v: string) => {
    const next = v as StockMoveType;
    setType(next);
    if (next === 'in') setFunding((f) => (f === 'none' ? 'wallet' : f));
  };

  return (
    <Modal
      open
      title="Catat stok"
      subtitle={selected ? `${selected.name}${selected.sku ? ` · ${selected.sku}` : ''}` : 'Mutasi persediaan'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <span className="spacer" />
          <Button variant="ghost" icon={Plus} onClick={() => submitRef.run('new')}>
            Simpan &amp; baru
          </Button>
          <Button variant="primary" onClick={() => submitRef.run('close')}>
            Simpan
          </Button>
        </>
      }
    >
      <div
        className="tx-form"
        data-form
        onKeyDown={(e) => {
          if (!isImeComposing(e) && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submitRef.runFrom(e.target, 'close');
          }
        }}
      >
        <Segmented
          value={type}
          onChange={switchType}
          options={MODES.map((m) => ({ value: m.value, label: m.label, icon: m.icon }))}
          block
          ariaLabel="Jenis mutasi"
          className="tx-modes"
        />

        <div style={{ marginTop: 14 }}>
          <Field error={tried && errs.qty}>
            <AmountInput
              ref={qtyRef}
              value={qty}
              onChange={setQty}
              invalid={tried && !!errs.qty}
              autoFocus
              ariaLabel="Kuantitas"
              prefix=""
              suffix={selected?.unit || 'unit'}
            />
          </Field>
          {frequent.length > 0 && (
            <div className="quick-cats">
              {frequent.map((it) => {
                const cat = it.categoryId ? cats.get(it.categoryId) : undefined;
                return (
                  <button
                    key={it.id}
                    type="button"
                    className="chip"
                    aria-pressed={item === it.id}
                    onClick={() => setItem(it.id)}
                    style={cat ? ({ '--cc': cat.color } as CSSProperties) : undefined}
                  >
                    <IconTile icon={cat?.icon ?? 'package'} color={cat?.color ?? '#8A6546'} size="xs" round />
                    {it.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="tx-grid">
          <Field label="Barang" error={tried && errs.item} className="span-2">
            <Select value={item} onChange={setItem} options={itemOpts} placeholder="Pilih barang…" invalid={tried && !!errs.item} searchable advance />
          </Field>
          <Field label="Tanggal" error={tried && errs.date}>
            <DatePicker value={date} onChange={setDate} invalid={tried && !!errs.date} advance />
          </Field>
          <Field label="Lokasi" error={tried && errs.transfer}>
            <Select value={locationId} onChange={setLocationId} options={locs} advance />
          </Field>
          {type === 'transfer' && (
            <Field label="Ke lokasi" className="span-2">
              <Select value={toLocationId} onChange={setToLocationId} options={locs} />
            </Field>
          )}
          {type === 'adjust' && (
            <Field label="Arah opname" className="span-2">
              <Segmented
                block
                size="sm"
                value={String(adjustSign)}
                onChange={(v) => setAdjustSign(v === '-1' ? -1 : 1)}
                options={[
                  { value: '1', label: 'Naik' },
                  { value: '-1', label: 'Turun' },
                ]}
              />
            </Field>
          )}
          {(type === 'in' || (type === 'adjust' && adjustSign === 1)) && (
            <Field
              label="Harga satuan"
              error={tried && errs.cost}
              hint={selected?.costPrice ? `Modal bawaan ${formatMoney(selected.costPrice)}` : undefined}
              className="span-2"
            >
              <AmountInput variant="inline" value={unitCost} onChange={setUnitCost} invalid={tried && !!errs.cost} />
            </Field>
          )}
          {type === 'in' && (
            <>
              <Field label="Pendanaan" className="span-2">
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
            </>
          )}
          <Field label="Catatan" optional className="span-2">
            <TextInput value={note} onChange={setNote} placeholder="Opsional" data-field />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
