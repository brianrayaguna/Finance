import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Plus,
  Search,
  Download,
  Trash2,
  Copy,
  Pencil,
  CalendarPlus,
  X,
  Inbox,
  FilterX,
  NotebookPen,
} from '../lib/glyphs';
import { useBooks, useToday } from '../hooks/useApp';
import { useUI, confirm } from '../store/ui';
import { deleteTransactions, duplicateTransaction, childCount } from '../store/data';
import { notify } from '../store/history';
import type { Transaction, TxType } from '../accounting/types';
import { formatDate, formatMoney, normalize, endOfMonth, DAYS, parseISO, round2, isZero } from '../lib/format';
import { isTypingTarget, layerCount, MOD } from '../lib/layers';
import { PageHeader } from '../components/layout/Topbar';
import { Button, Checkbox, EmptyState, TextInput, Money } from '../components/ui/primitives';
import { Segmented } from '../components/ui/Segmented';
import { Select } from '../components/ui/Select';
import { PeriodPicker, resolvePreset, type PeriodValue } from '../components/ui/PeriodPicker';
import { useContextMenu } from '../components/ui/Popover';
import { TxRow } from '../components/tx/TxRow';
import { cashDelta, txFlow } from '../components/tx/txDisplay';
import { TxViewSwitch } from '../components/tx/TxViewSwitch';
import { useCategoryOptions, useWalletOptions } from '../components/forms/options';
import { toast } from '../store/ui';
import { Dots } from '../components/ui/primitives';

type Kind = 'all' | 'in' | 'out' | 'transfer' | 'debt' | 'journal';

const KIND_TYPES: Record<Kind, TxType[] | null> = {
  all: null,
  in: ['income', 'receivable_collect'],
  out: ['expense', 'payable_pay'],
  transfer: ['transfer'],
  debt: ['payable_new', 'payable_pay', 'receivable_new', 'receivable_collect', 'receivable_writeoff'],
  journal: ['journal', 'opening'],
};

const PAGE = 120;

export default function Transactions() {
  const b = useBooks();
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const openTx = useUI((s) => s.openTx);
  const editTx = useUI((s) => s.editTx);
  const walletOpts = useWalletOptions(true);
  const expCats = useCategoryOptions('expense');
  const revCats = useCategoryOptions('revenue');

  const initialPeriod = (): PeriodValue => {
    const m = params.get('bulan');
    if (m) return { preset: 'month', from: m + '-01', to: endOfMonth(m + '-01') };
    return resolvePreset(params.get('kategori') || params.get('akun') ? 'all' : 'this_month', b.fyStartMonth, today);
  };

  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [period, setPeriod] = useState<PeriodValue>(initialPeriod);
  const [account, setAccount] = useState(params.get('akun') ?? '');
  const [category, setCategory] = useState(params.get('kategori') ?? '');
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const anchorIdx = useRef<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const ctx = useContextMenu();

  // Tautan masuk (rekening di sidebar, wawasan dasbor): ?akun, ?kategori, ?bulan. Dibaca setiap kali URL
  // berubah — bukan hanya saat halaman dibuka — agar klik rekening lain saat sudah di halaman ini ikut
  // mengganti filter. ?kategori & ?bulan sekali pakai; ?akun tetap di URL selama filternya aktif.
  useEffect(() => {
    const akun = params.get('akun') ?? '';
    const kategori = params.get('kategori');
    const bulan = params.get('bulan');
    if (kategori !== null || bulan !== null || akun !== account) {
      setQ('');
      setKind('all');
      setAccount(akun);
      setCategory(kategori ?? '');
      setPeriod(
        bulan
          ? { preset: 'month', from: bulan + '-01', to: endOfMonth(bulan + '-01') }
          : resolvePreset(akun || kategori ? 'all' : 'this_month', b.fyStartMonth, today),
      );
    }
    if (kategori !== null || bulan !== null)
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          n.delete('kategori');
          n.delete('bulan');
          return n;
        },
        { replace: true },
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // Filter akun tercermin di URL sehingga sidebar menyorot rekening yang sedang dilihat.
  useEffect(() => {
    if ((params.get('akun') ?? '') === account) return;
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (account) n.set('akun', account);
        else n.delete('akun');
        return n;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  const txById = useMemo(() => new Map(b.data.transactions.map((t) => [t.id, t])), [b]);

  const filtered = useMemo(() => {
    const types = KIND_TYPES[kind];
    const n = normalize(q.trim());
    const digits = q.replace(/[^\d]/g, '');
    return b.data.transactions
      .filter((t) => {
        if (t.date < period.from || t.date > period.to) return false;
        if (types && !types.includes(t.type)) return false;
        if (account && t.accountId !== account && t.toAccountId !== account && !t.lines?.some((l) => l.accountId === account)) return false;
        if (category && t.categoryId !== category && !t.lines?.some((l) => l.accountId === category)) return false;
        if (n) {
          const cat = b.acc.get(t.categoryId ?? '')?.name ?? '';
          const acc = b.acc.get(t.accountId ?? '')?.name ?? '';
          const to = b.acc.get(t.toAccountId ?? '')?.name ?? '';
          const hay = normalize(`${t.description} ${cat} ${acc} ${to} ${t.ref} ${t.contact ?? ''} ${t.note ?? ''}`);
          const amtHit = digits.length >= 3 && String(Math.round(t.amount)).includes(digits);
          if (!hay.includes(n) && !amtHit) return false;
        }
        return true;
      })
      .sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : (y.time ?? '').localeCompare(x.time ?? '') || y.createdAt - x.createdAt));
  }, [b, q, kind, period, account, category]);

  useEffect(() => {
    setLimit(PAGE);
    setSelected(new Set());
  }, [q, kind, period, account, category]);

  const visible = filtered.slice(0, limit);

  const summary = useMemo(() => {
    let inc = 0;
    let exp = 0;
    let spend = 0;
    let spendN = 0;
    for (const t of filtered) {
      const f = txFlow(t);
      inc += f.inc;
      exp += f.exp;
      if (t.type === 'expense') {
        spend += t.amount;
        spendN++;
      }
    }
    return { inc: round2(inc), exp: round2(exp), net: round2(inc - exp), avg: spendN ? Math.round(spend / spendN) : 0 };
  }, [filtered]);

  const groups = useMemo(() => {
    const out: { date: string; items: Transaction[]; net: number }[] = [];
    for (const t of visible) {
      let g = out[out.length - 1];
      if (!g || g.date !== t.date) out.push((g = { date: t.date, items: [], net: 0 }));
      g.items.push(t);
      g.net = round2(g.net + cashDelta(t));
    }
    return out;
  }, [visible]);

  const hasFilter = !!(q || kind !== 'all' || account || category || period.preset !== 'this_month');
  const clearFilters = () => {
    setQ('');
    setKind('all');
    setAccount('');
    setCategory('');
    setPeriod(resolvePreset('this_month', b.fyStartMonth, today));
  };

  const toggle = useCallback(
    (id: string, e?: React.MouseEvent) => {
      const idx = visible.findIndex((t) => t.id === id);
      setSelected((prev) => {
        const next = new Set(prev);
        if (e?.shiftKey && anchorIdx.current !== null) {
          const [a, c] = [Math.min(anchorIdx.current, idx), Math.max(anchorIdx.current, idx)];
          for (let i = a; i <= c; i++) next.add(visible[i].id);
        } else if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      anchorIdx.current = idx;
    },
    [visible],
  );

  const removeIds = async (ids: string[]) => {
    if (!ids.length) return;
    const kids = childCount(ids);
    const ok = await confirm({
      title: ids.length > 1 ? `Hapus ${ids.length} transaksi?` : 'Hapus transaksi ini?',
      message: kids ? `Termasuk ${kids} pembayaran hutang/piutang terkait. Tindakan ini dapat diurungkan.` : 'Jurnal terkait ikut dihapus dari buku besar. Tindakan ini dapat diurungkan.',
      confirmLabel: 'Hapus',
      tone: 'danger',
    });
    if (!ok) return;
    const hid = deleteTransactions(ids);
    if (!hid) return; // sebagian berada di periode terkunci — pilihan dipertahankan
    setSelected(new Set());
    notify(ids.length > 1 ? `${ids.length} transaksi dihapus` : 'Transaksi dihapus', hid, { tone: 'danger' });
  };

  const duplicate = (t: Transaction, date?: string) => {
    const r = duplicateTransaction(t.id, date ?? t.date);
    if (r) notify(`Diduplikat sebagai ${r.tx.ref}`, r.historyId);
  };

  const menuFor = (t: Transaction) => [
    { label: 'Ubah', icon: Pencil, kbd: '↵', onSelect: () => editTx(t) },
    { label: 'Duplikat', icon: Copy, kbd: 'D', onSelect: () => duplicate(t) },
    { label: 'Duplikat ke hari ini', icon: CalendarPlus, onSelect: () => duplicate(t, today) },
    { label: 'Lihat di jurnal', icon: NotebookPen, onSelect: () => navigate(`/jurnal?cari=${encodeURIComponent(t.ref)}`) },
    { separator: true },
    { label: selected.size > 1 && selected.has(t.id) ? `Hapus ${selected.size} transaksi` : 'Hapus', icon: Trash2, kbd: '⌫', danger: true, onSelect: () => removeIds(selected.size > 1 && selected.has(t.id) ? [...selected] : [t.id]) },
  ];

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (layerCount() > 0) return;
      if (isTypingTarget(e.target)) {
        if (e.key === 'Escape' && e.target === searchRef.current) {
          searchRef.current?.blur();
        } else if (e.key === 'ArrowDown' && e.target === searchRef.current && visible.length) {
          e.preventDefault();
          searchRef.current?.blur();
          setFocusId(visible[0].id);
        }
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === '/' || (mod && e.key.toLowerCase() === 'f')) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelected(new Set(visible.map((t) => t.id)));
        return;
      }
      if (e.key === 'Escape' && selected.size) {
        setSelected(new Set());
        return;
      }
      const idx = focusId ? visible.findIndex((t) => t.id === focusId) : -1;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'j' || e.key === 'k') {
        e.preventDefault();
        const down = e.key === 'ArrowDown' || e.key === 'j';
        const n = Math.max(0, Math.min(visible.length - 1, idx + (down ? 1 : -1)));
        const t = visible[n];
        if (!t) return;
        setFocusId(t.id);
        if (e.shiftKey) setSelected((s) => new Set(s).add(t.id));
        return;
      }
      const cur = visible[idx];
      if (!cur) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        editTx(cur);
      } else if (e.key === ' ') {
        e.preventDefault();
        toggle(cur.id);
      } else if (e.key.toLowerCase() === 'd' && !mod) {
        e.preventDefault();
        duplicate(cur);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        removeIds(selected.size ? [...selected] : [cur.id]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, focusId, selected, editTx, toggle]);

  useEffect(() => {
    if (!focusId) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-id="${focusId}"]`);
    el?.scrollIntoView({ block: 'nearest' });
    // Saat navigasi keyboard, fokus DOM ikut pindah agar Enter membuka baris yang sama dengan sorotan.
    const act = document.activeElement as HTMLElement | null;
    if (el && act && act !== el && act.classList.contains('tx-row')) el.focus({ preventScroll: true });
  }, [focusId]);

  const doExport = async (ids?: Set<string>) => {
    setExporting(true);
    try {
      const { exportTransactions } = await import('../export/excel');
      const rows = ids ? filtered.filter((t) => ids.has(t.id)) : filtered;
      await exportTransactions(b, rows, period);
      toast(`${rows.length} transaksi diekspor ke Excel`, { tone: 'success' });
    } catch (err) {
      console.error(err);
      toast('Ekspor gagal', { tone: 'danger' });
    } finally {
      setExporting(false);
    }
  };

  const selTotal = useMemo(() => [...selected].reduce((s, id) => s + (txById.get(id)?.amount ?? 0), 0), [selected, txById]);
  const allSel = visible.length > 0 && visible.every((t) => selected.has(t.id));
  const someSel = selected.size > 0 && !allSel;

  const catOptions = useMemo(() => [{ value: '', label: 'Semua kategori' }, ...expCats, ...revCats], [expCats, revCats]);
  const accOptions = useMemo(() => [{ value: '', label: 'Semua akun' }, ...walletOpts.map((w) => ({ ...w, sub: undefined }))], [walletOpts]);

  return (
    <div>
      <PageHeader
        title="Transaksi"
        subtitle={`${filtered.length.toLocaleString('id-ID')} transaksi · ${formatDate(period.from === '1900-01-01' ? (filtered[filtered.length - 1]?.date ?? today) : period.from)} – ${formatDate(period.to === '2999-12-31' ? today : period.to)}`}
        actions={
          <>
            <TxViewSwitch value="daftar" />
            <PeriodPicker value={period} onChange={setPeriod} fyStartMonth={b.fyStartMonth} />
            <Button icon={exporting ? undefined : Download} onClick={() => doExport()} disabled={!filtered.length || exporting}>
              {exporting ? <Dots /> : 'Ekspor Excel'}
            </Button>
          </>
        }
      />

      <div className="sum-strip">
        <div>
          <span>Pemasukan</span>
          <Money value={summary.inc} className="pos" />
        </div>
        <div>
          <span title="Hanya transaksi yang dicatat. Penyusutan dan jurnal penyesuaian tidak termasuk — lihat Beban di Ringkasan atau Laporan Laba Rugi.">
            Pengeluaran <small className="sum-hint">tanpa penyusutan</small>
          </span>
          <Money value={summary.exp} />
        </div>
        <div>
          <span>Selisih</span>
          <Money value={summary.net} tone="auto" sign="always" />
        </div>
        <div>
          <span>Rata-rata pengeluaran</span>
          <Money value={summary.avg} />
        </div>
      </div>

      <div className="card tx-card" ref={listRef}>
        <div className="list-toolbar">
          <div className="lt-row">
            <div className="fb-search">
              <TextInput
                ref={searchRef}
                value={q}
                onChange={setQ}
                icon={Search}
                placeholder="Cari keterangan, kategori, nominal, nomor bukti…"
                clearable
                sunken
                suffix={!q ? <span className="kbd">/</span> : undefined}
              />
            </div>
          </div>
          <div className="lt-row">
            <Segmented
              size="sm"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'all', label: 'Semua' },
                { value: 'in', label: 'Masuk' },
                { value: 'out', label: 'Keluar' },
                { value: 'transfer', label: 'Transfer' },
                { value: 'debt', label: 'Hutang/Piutang' },
                { value: 'journal', label: 'Jurnal' },
              ]}
            />
            <div className="lt-filters">
              <div style={{ width: 176 }}>
                <Select compact value={account} onChange={setAccount} options={accOptions} placeholder="Semua akun" width={260} />
              </div>
              <div style={{ width: 188 }}>
                <Select compact value={category} onChange={setCategory} options={catOptions} placeholder="Semua kategori" searchable width={280} />
              </div>
              {hasFilter && (
                <Button size="sm" variant="ghost" icon={FilterX} onClick={clearFilters}>
                  Reset
                </Button>
              )}
            </div>
          </div>
        </div>
        {filtered.length === 0 ? (
          <EmptyState
            icon={hasFilter ? FilterX : Inbox}
            title={hasFilter ? 'Tidak ada transaksi yang cocok' : 'Belum ada transaksi'}
            text={hasFilter ? 'Coba ubah kata kunci atau rentang waktu.' : 'Transaksi yang Anda catat akan muncul di sini, dikelompokkan per hari.'}
            action={
              hasFilter ? (
                <Button onClick={clearFilters} icon={FilterX}>
                  Reset filter
                </Button>
              ) : (
                <Button variant="primary" icon={Plus} onClick={() => openTx()}>
                  Catat transaksi
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className="tx-head">
              <Checkbox checked={allSel} mixed={someSel} onChange={() => setSelected(allSel ? new Set() : new Set(visible.map((t) => t.id)))} label="Pilih semua" />
              <span className="grow">Keterangan</span>
              <span className="tx-ref-h">No. Bukti</span>
              <span className="tx-amt-h">Nominal</span>
            </div>
            {groups.map((g) => (
              <section key={g.date} className="tx-day">
                <header className="tx-day-head">
                  <span className="dname">{DAYS[parseISO(g.date).getDay()]}</span>
                  <span className="ddate">{formatDate(g.date, 'long')}</span>
                  {g.date === today && <span className="badge badge-accent">Hari ini</span>}
                  <span className="spacer" />
                  <span className={`num money-val dnet ${g.net > 0 ? 'pos' : ''}`}>{isZero(g.net) ? '' : formatMoney(g.net, { sign: 'always' })}</span>
                </header>
                {g.items.map((t) => (
                  <TxRow
                    key={t.id}
                    tx={t}
                    acc={b.acc}
                    parent={t.parentId ? txById.get(t.parentId) : undefined}
                    selectable
                    selected={selected.has(t.id)}
                    focused={focusId === t.id}
                    onToggle={toggle}
                    onOpen={(x) => {
                      setFocusId(x.id);
                      editTx(x);
                    }}
                    onFocusRow={setFocusId}
                    onContext={(e, x) => {
                      setFocusId(x.id);
                      ctx.open(e, menuFor(x));
                    }}
                  />
                ))}
              </section>
            ))}
            {filtered.length > limit && (
              <div className="load-more">
                <Button onClick={() => setLimit((l) => l + PAGE)}>
                  Tampilkan {Math.min(PAGE, filtered.length - limit)} lagi · {(filtered.length - limit).toLocaleString('id-ID')} tersisa
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      {ctx.node}

      {createPortal(
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            className="bulk-bar"
            initial={{ opacity: 0, y: 24, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%', transition: { type: 'spring', stiffness: 420, damping: 32 } }}
            exit={{ opacity: 0, y: 16, x: '-50%' }}
          >
            <span className="bb-count">{selected.size} dipilih</span>
            <span className="bb-total num money-val">{formatMoney(selTotal)}</span>
            <span className="tb-sep" />
            <Button size="sm" variant="ghost" icon={Download} onClick={() => doExport(selected)}>
              Ekspor
            </Button>
            <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => removeIds([...selected])}>
              Hapus
            </Button>
            <button type="button" className="tb-btn" onClick={() => setSelected(new Set())} aria-label="Batalkan pilihan" title={`Batalkan (esc)`}>
              <X />
            </button>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body,
      )}
      <div className="kbd-hint no-print">
        <span className="kbd">↑</span>
        <span className="kbd">↓</span> pilih · <span className="kbd">↵</span> ubah · <span className="kbd">D</span> duplikat · <span className="kbd">⌫</span> hapus ·{' '}
        <span className="kbd">{MOD}</span>
        <span className="kbd">A</span> pilih semua
      </div>
    </div>
  );
}
