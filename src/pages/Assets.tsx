import { useMemo, useState } from 'react';
import { Plus, Boxes, Ellipsis, Pencil, Trash2, CalendarRange, BadgeDollarSign, Undo2 } from 'lucide-react';
import { useBooks, useToday } from '../hooks/useApp';
import { addAsset, deleteAsset, updateAsset, useData } from '../store/data';
import { confirm } from '../store/ui';
import { notify } from '../store/history';
import { accumulatedAt, depreciationSchedule, disposalStop } from '../accounting/engine';
import { isLocked } from '../accounting/lock';
import type { DepreciationMethod, FixedAsset } from '../accounting/types';
import { addDays, endOfMonth, formatDate, formatMoney, round2, todayISO } from '../lib/format';
import { PageHeader } from '../components/layout/Topbar';
import { Badge, Button, EmptyState, Field, IconTile, Money, Progress, Switch, TextInput, TableWrap } from '../components/ui/primitives';
import { Menu } from '../components/ui/Popover';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { Segmented } from '../components/ui/Segmented';
import { AmountInput } from '../components/ui/AmountInput';
import { DatePicker } from '../components/ui/DatePicker';
import { useWalletOptions } from '../components/forms/options';

function lifeLabel(m: number) {
  const y = Math.floor(m / 12);
  const r = m % 12;
  return [y ? `${y} th` : '', r ? `${r} bln` : ''].filter(Boolean).join(' ') || '0 bln';
}

export default function Assets() {
  const b = useBooks();
  const today = useToday();
  const [modal, setModal] = useState<{ editing?: FixedAsset } | null>(null);
  const [sched, setSched] = useState<FixedAsset | null>(null);
  const [dispose, setDispose] = useState<FixedAsset | null>(null);

  const rows = useMemo(
    () =>
      b.data.assets
        .map((a) => {
          // Per hari ini — sama dengan Neraca & Buku Besar (penyusutan diposting setiap akhir bulan).
          const stop = disposalStop(a);
          const acc = accumulatedAt(a, stop ?? today);
          const book = round2(a.cost - acc);
          const fully = a.depreciable !== false && book - a.residualValue <= 0.005;
          const monthDep = depreciationSchedule(a).find((r) => r.period === today.slice(0, 7))?.amount ?? 0;
          return { a, acc, book, fully, disposed: !!stop, monthDep: stop ? 0 : monthDep, account: b.acc.get(a.accountId) };
        })
        .sort((x, y) => (x.a.acquisitionDate < y.a.acquisitionDate ? 1 : -1)),
    [b, today],
  );
  const active = rows.filter((r) => !r.disposed);
  const tot = {
    cost: active.reduce((s, r) => s + r.a.cost, 0),
    acc: active.reduce((s, r) => s + r.acc, 0),
    book: active.reduce((s, r) => s + r.book, 0),
    month: active.reduce((s, r) => s + r.monthDep, 0),
  };

  const remove = async (a: FixedAsset) => {
    const ok = await confirm({ title: `Hapus ${a.name}?`, message: 'Jurnal perolehan, penyusutan, dan pelepasan aset ini ikut dihapus.', confirmLabel: 'Hapus', tone: 'danger' });
    if (ok) notify(`${a.name} dihapus`, deleteAsset(a.id), { tone: 'danger' });
  };

  return (
    <div>
      <PageHeader
        title="Aset Tetap"
        subtitle="Register aset dengan penyusutan otomatis setiap akhir bulan"
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setModal({})}>
            Tambah aset
          </Button>
        }
      />
      <div className="sum-strip big">
        <div>
          <span>Harga perolehan</span>
          <Money value={tot.cost} />
        </div>
        <div>
          <span>Akumulasi penyusutan</span>
          <Money value={-tot.acc} />
        </div>
        <div>
          <span>Nilai buku</span>
          <Money value={tot.book} />
        </div>
        <div>
          <span>Penyusutan bulan ini</span>
          <Money value={tot.month} />
        </div>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title="Belum ada aset tetap"
            text="Catat laptop, kendaraan, atau properti — penyusutan akan dijurnal otomatis setiap bulan."
            action={
              <Button variant="primary" icon={Plus} onClick={() => setModal({})}>
                Tambah aset
              </Button>
            }
          />
        ) : (
          <TableWrap label="Daftar aset tetap">
            <table className="table">
              <thead>
                <tr>
                  <th>Aset</th>
                  <th className="r">Harga perolehan</th>
                  <th>Umur · Metode</th>
                  <th className="r">Akum. penyusutan</th>
                  <th className="r">Nilai buku</th>
                  <th style={{ width: 120 }}>Tersusutkan</th>
                  <th>Status</th>
                  <th style={{ width: 48 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ a, acc, book, fully, account }) => {
                  const base = a.cost - a.residualValue;
                  return (
                    <tr key={a.id} className="clickable asset-row" onClick={() => setSched(a)}>
                      <td>
                        <div className="row">
                          <IconTile icon={account?.icon} color={account?.color} size="sm" />
                          <div className="col" style={{ minWidth: 0 }}>
                            <strong className="truncate" style={{ maxWidth: 240 }}>{a.name}</strong>
                            <span className="muted" style={{ fontSize: 12 }}>
                              {account?.name} · {a.ref}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="r">
                        <div className="col" style={{ alignItems: 'flex-end' }}>
                          <span className="num money-val">{formatMoney(a.cost, { symbol: false })}</span>
                          <span className="muted" style={{ fontSize: 12 }}>{formatDate(a.acquisitionDate)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="col">
                          {a.depreciable === false ? (
                            <span>Tidak disusutkan</span>
                          ) : (
                            <>
                              <span>{lifeLabel(a.usefulLifeMonths)}</span>
                              <span className="muted" style={{ fontSize: 12 }}>{a.method === 'straight_line' ? 'Garis lurus' : 'Saldo menurun ganda'}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="r num money-val">({formatMoney(acc, { symbol: false })})</td>
                      <td className="r num money-val">
                        <strong>{formatMoney(book, { symbol: false })}</strong>
                      </td>
                      <td>
                        {a.depreciable === false ? <span className="muted">—</span> : <Progress value={base > 0 ? acc / base : 1} thin color={account?.color} label={`${a.name} tersusutkan`} />}
                      </td>
                      <td>
                        {a.disposal ? (
                          <Badge>Dilepas {formatDate(a.disposal.date)}</Badge>
                        ) : a.depreciable === false ? (
                          <Badge tone="info">Tidak disusutkan</Badge>
                        ) : fully ? (
                          <Badge tone="info">Habis disusutkan</Badge>
                        ) : a.acquisitionDate > today ? (
                          <Badge tone="warn">Belum berlaku</Badge>
                        ) : (
                          <Badge tone="pos" dot>
                            Aktif
                          </Badge>
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <Menu
                          items={[
                            { label: 'Jadwal penyusutan', icon: CalendarRange, onSelect: () => setSched(a) },
                            { label: 'Ubah', icon: Pencil, onSelect: () => setModal({ editing: a }) },
                            a.disposal
                              ? { label: 'Batalkan pelepasan', icon: Undo2, onSelect: () => notify('Pelepasan dibatalkan', updateAsset(a.id, { disposal: undefined }, 'Batalkan pelepasan aset')) }
                              : { label: 'Jual / lepaskan aset…', icon: BadgeDollarSign, onSelect: () => setDispose(a) },
                            { separator: true },
                            { label: 'Hapus', icon: Trash2, danger: true, onSelect: () => remove(a) },
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
      {modal && <AssetModal editing={modal.editing} onClose={() => setModal(null)} />}
      {sched && <ScheduleModal asset={sched} onClose={() => setSched(null)} />}
      {dispose && <DisposeModal asset={dispose} onClose={() => setDispose(null)} />}
    </div>
  );
}

function AssetModal({ editing, onClose }: { editing?: FixedAsset; onClose: () => void }) {
  const b = useBooks();
  const wallets = useWalletOptions();
  const assetAccounts = b.accounts.filter((a) => a.subtype === 'fixed_asset' && !a.archived).map((a) => ({ value: a.id, label: a.name, icon: a.icon, color: a.color, sub: a.code }));
  const [name, setName] = useState(editing?.name ?? '');
  const [accountId, setAccountId] = useState(editing?.accountId ?? assetAccounts[0]?.value ?? '');
  const [date, setDate] = useState(editing?.acquisitionDate ?? todayISO());
  const [cost, setCost] = useState<number | null>(editing?.cost ?? null);
  const [residual, setResidual] = useState<number | null>(editing?.residualValue ?? null);
  const [life, setLife] = useState(String(editing?.usefulLifeMonths ?? 48));
  const [method, setMethod] = useState<DepreciationMethod>(editing?.method ?? 'straight_line');
  const [depreciable, setDepreciable] = useState(editing?.depreciable !== false);
  const [funding, setFunding] = useState<'wallet' | 'opening'>(editing?.funding ?? 'wallet');
  const [wallet, setWallet] = useState(editing?.paidFromAccountId ?? wallets.find((w) => w.group !== 'Kartu Kredit / PayLater')?.value ?? '');
  const [tried, setTried] = useState(false);
  const lifeN = Math.max(0, Math.round(Number(life) || 0));
  const errs = {
    name: !name.trim() ? 'Nama aset wajib diisi' : null,
    cost: !cost ? 'Masukkan harga perolehan' : null,
    residual: depreciable && cost && (residual ?? 0) >= cost ? 'Nilai sisa harus di bawah harga perolehan' : null,
    life: !depreciable ? null : lifeN < 1 ? 'Umur minimal 1 bulan' : lifeN > 600 ? 'Maksimal 50 tahun' : null,
    wallet: funding === 'wallet' && !wallet ? 'Pilih akun pembayaran' : null,
    account: !accountId ? 'Pilih kelompok aset' : null,
    date: editing?.disposal && date > editing.disposal.date ? `Setelah tanggal pelepasan (${formatDate(editing.disposal.date)})` : null,
  };
  const monthly = depreciable && cost && lifeN ? (cost - (residual ?? 0)) / lifeN : 0;

  const submit = () => {
    setTried(true);
    if (Object.values(errs).some(Boolean)) return;
    const payload = {
      name: name.trim(),
      accountId,
      acquisitionDate: date,
      cost: cost!,
      residualValue: depreciable ? residual ?? 0 : 0,
      usefulLifeMonths: Math.max(1, lifeN),
      method,
      depreciable: depreciable ? undefined : (false as const),
      funding,
      paidFromAccountId: funding === 'wallet' ? wallet : undefined,
    };
    // id riwayat kosong = ditolak kunci periode; formulir tetap terbuka.
    if (editing) {
      const hid = updateAsset(editing.id, payload);
      if (!hid) return;
      notify(`${payload.name} diperbarui`, hid);
    } else {
      const { asset, historyId } = addAsset(payload);
      if (!historyId) return;
      notify(`${asset.name} ditambahkan`, historyId, { detail: asset.ref });
    }
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={editing ? 'Ubah aset tetap' : 'Aset tetap baru'}
      subtitle={depreciable ? 'Penyusutan dijurnal otomatis setiap akhir bulan mulai bulan berikutnya' : 'Aset ini dicatat di neraca tanpa penyusutan (mis. tanah)'}
      footer={
        <>
          <span className="hint">{monthly > 0 && `≈ ${formatMoney(monthly)} / bulan (garis lurus)`}</span>
          <span className="spacer" />
          <Button onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={submit}>
            {editing ? 'Simpan' : 'Tambahkan aset'}
          </Button>
        </>
      }
    >
      <div
        className="tx-grid"
        style={{ marginTop: 4 }}
        data-form
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
        }}
      >
        <Field label="Nama aset" error={tried && errs.name} className="span-2">
          <TextInput value={name} onChange={setName} placeholder="mis. Laptop kerja" autoFocus data-field invalid={tried && !!errs.name} />
        </Field>
        <Field label="Kelompok aset" error={tried && errs.account}>
          <Select value={accountId} onChange={setAccountId} options={assetAccounts} placeholder="Pilih…" advance />
        </Field>
        <Field label="Tanggal perolehan" error={tried && errs.date}>
          <DatePicker value={date} onChange={setDate} advance />
        </Field>
        <Field label="Harga perolehan" error={tried && errs.cost}>
          <AmountInput variant="inline" value={cost} onChange={setCost} invalid={tried && !!errs.cost} />
        </Field>
        <Field label="Disusutkan" className="span-2" hint="Matikan untuk aset yang tidak berkurang nilainya karena pemakaian, seperti tanah.">
          <Switch checked={depreciable} onChange={setDepreciable} label="Disusutkan" />
        </Field>
        {depreciable && (
          <>
            <Field label="Nilai sisa (residu)" optional error={tried && errs.residual}>
              <AmountInput variant="inline" value={residual} onChange={setResidual} />
            </Field>
            <Field label="Umur ekonomis (bulan)" error={tried && errs.life} hint={lifeN ? lifeLabel(lifeN) : undefined}>
              <TextInput value={life} onChange={(v) => setLife(v.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" data-field className="num" suffix="bulan" />
            </Field>
            <Field label="Preset umur">
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {[24, 48, 60, 96, 240].map((m) => (
                  <button key={m} type="button" className="chip" aria-pressed={lifeN === m} onClick={() => setLife(String(m))}>
                    {m / 12} th
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Metode penyusutan" className="span-2">
              <Segmented
                block
                value={method}
                onChange={setMethod}
                options={[
                  { value: 'straight_line', label: 'Garis lurus' },
                  { value: 'declining_balance', label: 'Saldo menurun ganda' },
                ]}
              />
            </Field>
          </>
        )}
        <Field label="Sumber perolehan" className="span-2">
          <Segmented
            block
            size="sm"
            value={funding}
            onChange={setFunding}
            options={[
              { value: 'wallet', label: 'Dibeli dari dompet / rekening' },
              { value: 'opening', label: 'Sudah dimiliki (saldo awal)' },
            ]}
          />
        </Field>
        {funding === 'wallet' && (
          <Field label="Dibayar dari" error={tried && errs.wallet} className="span-2">
            <Select value={wallet} onChange={setWallet} options={wallets} placeholder="Pilih akun…" />
          </Field>
        )}
      </div>
    </Modal>
  );
}

function ScheduleModal({ asset, onClose }: { asset: FixedAsset; onClose: () => void }) {
  const [mode, setMode] = useState<'year' | 'month'>('year');
  const today = todayISO();
  const rows = depreciationSchedule(asset);
  const stop = disposalStop(asset);
  const years = useMemo(() => {
    const m = new Map<string, { amount: number; acc: number; book: number }>();
    for (const r of rows) {
      if (stop && r.date >= stop) break;
      const y = r.period.slice(0, 4);
      const e = m.get(y) ?? { amount: 0, acc: 0, book: 0 };
      e.amount += r.amount;
      e.acc = r.accumulated;
      e.book = r.book;
      m.set(y, e);
    }
    return [...m.entries()];
  }, [rows, stop]);
  return (
    <Modal open onClose={onClose} size="lg" title="Jadwal penyusutan" subtitle={asset.depreciable === false ? `${asset.name} · ${formatMoney(asset.cost)} · tidak disusutkan` : `${asset.name} · ${formatMoney(asset.cost)} · ${lifeLabel(asset.usefulLifeMonths)} · ${asset.method === 'straight_line' ? 'garis lurus' : 'saldo menurun ganda'}`}
      headerExtra={<Segmented size="sm" value={mode} onChange={setMode} options={[{ value: 'year', label: 'Tahunan' }, { value: 'month', label: 'Bulanan' }]} />}
    >
      {asset.depreciable === false && <p className="muted" style={{ margin: '4px 0 0' }}>Aset ini tidak disusutkan, sehingga tidak ada jadwal penyusutan.</p>}
      <div className="card" hidden={asset.depreciable === false} style={{ boxShadow: '0 0 0 .5px var(--line-2)' }}>
        <TableWrap label="Jadwal penyusutan" style={{ maxHeight: 460 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Periode</th>
                <th className="r">Penyusutan</th>
                <th className="r">Akumulasi</th>
                <th className="r">Nilai buku</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {mode === 'year'
                ? years.map(([y, e]) => (
                    <tr key={y}>
                      <td>{y}</td>
                      <td className="r num">{formatMoney(e.amount, { symbol: false })}</td>
                      <td className="r num">{formatMoney(e.acc, { symbol: false })}</td>
                      <td className="r num">{formatMoney(e.book, { symbol: false })}</td>
                      <td>{y < today.slice(0, 4) ? <Badge tone="pos">Terposting</Badge> : y === today.slice(0, 4) ? <Badge tone="accent">Berjalan</Badge> : <Badge>Mendatang</Badge>}</td>
                    </tr>
                  ))
                : rows.map((r) => {
                    const posted = r.date <= endOfMonth(today) && (!stop || r.date < stop);
                    return (
                      <tr key={r.period} style={!posted ? { opacity: 0.55 } : undefined}>
                        <td>{formatDate(r.date)}</td>
                        <td className="r num">{formatMoney(r.amount, { symbol: false })}</td>
                        <td className="r num">{formatMoney(r.accumulated, { symbol: false })}</td>
                        <td className="r num">{formatMoney(r.book, { symbol: false })}</td>
                        <td>{stop && r.date >= stop ? <Badge>Dihentikan</Badge> : posted ? <Badge tone="pos">Terposting</Badge> : <Badge>Mendatang</Badge>}</td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </TableWrap>
      </div>
    </Modal>
  );
}

function DisposeModal({ asset, onClose }: { asset: FixedAsset; onClose: () => void }) {
  const wallets = useWalletOptions();
  const [date, setDate] = useState(todayISO());
  const [proceeds, setProceeds] = useState<number | null>(null);
  const [wallet, setWallet] = useState(asset.paidFromAccountId ?? wallets[0]?.value ?? '');
  const acc = accumulatedAt({ ...asset, disposal: { date, proceeds: 0, accountId: wallet } }, date);
  const book = round2(asset.cost - acc);
  const gain = round2((proceeds ?? 0) - book);
  const lockDate = useData((st) => st.data.profile.lockDate);
  const invalid = !wallet || date < asset.acquisitionDate || date > todayISO() || isLocked(date, lockDate);
  const submit = () => {
    if (invalid) return;
    const hid = updateAsset(asset.id, { disposal: { date, proceeds: proceeds ?? 0, accountId: wallet } }, 'Pelepasan aset tetap');
    if (!hid) return;
    notify(`${asset.name} dilepas`, hid);
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Jual / lepaskan aset"
      subtitle={asset.name}
      footer={
        <>
          <span className="spacer" />
          <Button onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={submit} disabled={invalid}>
            Catat pelepasan
          </Button>
        </>
      }
    >
      <div className="stack">
        <Field
          label="Tanggal pelepasan"
          error={date < asset.acquisitionDate ? 'Sebelum tanggal perolehan' : isLocked(date, lockDate) ? `Periode sampai ${formatDate(lockDate!)} sudah dikunci` : undefined}
        >
          <DatePicker value={date} onChange={setDate} min={lockDate && lockDate >= asset.acquisitionDate ? addDays(lockDate, 1) : asset.acquisitionDate} max={todayISO()} />
        </Field>
        <Field label="Harga jual / nilai diterima" optional>
          <AmountInput value={proceeds} onChange={setProceeds} autoFocus />
        </Field>
        <Field label="Diterima di">
          <Select value={wallet} onChange={setWallet} options={wallets} />
        </Field>
        <div className="recon-row">
          <span className="muted">Nilai buku per tanggal</span>
          <strong className="num money-val">{formatMoney(book)}</strong>
        </div>
        <div className={`recon-diff ${gain > 0 ? 'up' : gain < 0 ? 'down' : ''}`}>
          <span>{gain >= 0 ? 'Laba pelepasan' : 'Rugi pelepasan'}</span>
          <strong className="num">{formatMoney(Math.abs(gain))}</strong>
        </div>
      </div>
    </Modal>
  );
}
