import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  NotebookPen,
  Handshake,
  HandCoins,
  Sun,
  Moon,
  EyeOff,
  Keyboard,
  FileSpreadsheet,
  PanelLeft,
  CornerDownLeft,
  LayoutDashboard,
  Flag,
  Star,
  BookOpenCheck,
  type LucideIcon,
} from 'lucide-react';
import { ALL_NAV } from '../app/nav';
import { useData } from '../store/data';
import { usePrefs, useUI } from '../store/ui';
import { useLayer } from '../lib/layers';
import { formatDate, formatMoney, normalize } from '../lib/format';
import { TX_META } from '../accounting/engine';
import { TYPE_LABEL } from '../accounting/coa';
import { IconTile } from './ui/primitives';
import { runTemplate } from './tx/templates';

interface Item {
  id: string;
  group: string;
  title: string;
  sub?: string;
  right?: ReactNode;
  icon: ReactNode;
  run: () => void;
  score: number;
}

function highlight(text: string, q: string): ReactNode {
  if (!q) return text;
  const n = normalize(text);
  const i = n.indexOf(normalize(q));
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="hl">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

const lucideTile = (I: LucideIcon, color = 'var(--accent)') => <IconTile icon={I} color={color} size="sm" />;

export function CommandPalette() {
  const open = useUI((s) => s.palette);
  const setOpen = useUI((s) => s.setPalette);
  useLayer(open, () => setOpen(false));
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="palette-root">
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onMouseDown={() => setOpen(false)}
            style={{ background: 'color-mix(in srgb, var(--overlay) 70%, transparent)' }}
          />
          <motion.div
            className="palette"
            initial={{ opacity: 0, scale: 0.97, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 480, damping: 34 } }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
          >
            <PaletteBody onClose={() => setOpen(false)} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const data = useData((s) => s.data);
  const nav = useNavigate();
  const openTx = useUI((s) => s.openTx);
  const editTx = useUI((s) => s.editTx);
  const setShortcuts = useUI((s) => s.setShortcuts);
  const prefs = usePrefs();

  useEffect(() => {
    input.current?.focus();
  }, []);

  const items = useMemo(() => {
    const query = q.trim();
    const n = normalize(query);
    const out: Item[] = [];
    const match = (s: string) => {
      if (!n) return 1;
      const h = normalize(s);
      if (h.startsWith(n)) return 3;
      if (h.includes(' ' + n)) return 2;
      if (h.includes(n)) return 1;
      return 0;
    };
    const go = (f: () => void) => () => {
      onClose();
      f();
    };

    const simple = prefs.mode === 'simple';
    const actions: [string, string, LucideIcon, string, () => void][] = [
      ['a-exp', 'Catat pengeluaran', ArrowUpRight, 'var(--neg)', () => openTx({ type: 'expense' })],
      ['a-inc', 'Catat pemasukan', ArrowDownLeft, 'var(--pos)', () => openTx({ type: 'income' })],
      ['a-trf', 'Transfer antar akun', ArrowLeftRight, 'var(--info)', () => openTx({ type: 'transfer' })],
      ['a-pay', 'Catat hutang baru', Handshake, 'var(--tone-payable)', () => openTx({ type: 'payable_new' })],
      ['a-rec', 'Catat piutang baru', HandCoins, 'var(--tone-receivable)', () => openTx({ type: 'receivable_new' })],
      ...(simple ? [] : [['a-jrn', 'Buat jurnal umum', NotebookPen, 'var(--accent)', () => openTx({ type: 'journal' })] as [string, string, LucideIcon, string, () => void]]),
      ['a-goal', 'Tambah target tabungan', Flag, 'var(--accent)', () => nav('/anggaran#target')],
      ['a-dash', 'Sesuaikan dasbor (widget & tata letak)', LayoutDashboard, 'var(--accent)', () => nav('/?sesuaikan=1')],
      ['a-xls', 'Ekspor laporan keuangan (Excel)', FileSpreadsheet, 'var(--pos)', () => nav('/laporan?ekspor=1')],
      [
        'a-mode',
        simple ? 'Beralih ke mode Akuntan' : 'Beralih ke mode Sederhana',
        BookOpenCheck,
        'var(--text-2)',
        () => prefs.set({ mode: simple ? 'accountant' : 'simple' }),
      ],
      ['a-theme', prefs.theme === 'dark' ? 'Beralih ke tema terang' : 'Beralih ke tema gelap', prefs.theme === 'dark' ? Sun : Moon, 'var(--text-2)', () => prefs.set({ theme: prefs.theme === 'dark' ? 'light' : 'dark' })],
      ['a-priv', prefs.hideAmounts ? 'Tampilkan nominal' : 'Sembunyikan nominal', EyeOff, 'var(--text-2)', () => prefs.set({ hideAmounts: !prefs.hideAmounts })],
      ['a-side', prefs.sidebarCollapsed ? 'Tampilkan sidebar' : 'Ciutkan sidebar', PanelLeft, 'var(--text-2)', () => prefs.set({ sidebarCollapsed: !prefs.sidebarCollapsed })],
      ['a-keys', 'Lihat pintasan keyboard', Keyboard, 'var(--text-2)', () => setShortcuts(true)],
    ];
    for (const [id, title, I, c, run] of actions) {
      const s = match(title);
      if (s) out.push({ id, group: 'Tindakan', title, icon: lucideTile(I, c), run: go(run), score: s + (n ? 0 : 10) });
    }
    // transaksi favorit: sekali pilih langsung tercatat
    for (const t of data.templates) {
      const s = match(`favorit ${t.name} ${t.description ?? ''}`);
      if (s && n)
        out.push({
          id: 'f-' + t.id,
          group: 'Favorit',
          title: t.name,
          sub: t.amount ? 'Catat sekarang' : 'Buka formulir terisi',
          right: t.amount ? <span className="money-val">{formatMoney(t.amount)}</span> : undefined,
          icon: lucideTile(Star, 'var(--warn)'),
          run: go(() => runTemplate(t)),
          score: s + 1,
        });
    }
    for (const p of ALL_NAV) {
      const s = match(p.label);
      if (s) out.push({ id: 'p-' + p.to, group: 'Halaman', title: p.label, sub: p.desc ?? 'Buka halaman', icon: lucideTile(p.icon, 'var(--text-2)'), run: go(() => nav(p.to)), score: s + 1 });
    }

    if (n) {
      const accById = new Map(data.accounts.map((a) => [a.id, a]));
      const digits = query.replace(/[^\d]/g, '');
      const txs = [...data.transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
      let count = 0;
      for (const t of txs) {
        if (count >= 12) break;
        const cat = accById.get(t.categoryId ?? '')?.name ?? '';
        const acc = accById.get(t.accountId ?? '')?.name ?? '';
        const hay = `${t.description} ${cat} ${acc} ${t.ref} ${t.contact ?? ''} ${t.note ?? ''} ${TX_META[t.type].label}`;
        let s = match(hay);
        if (!s && digits.length >= 3 && String(Math.round(t.amount)).includes(digits)) s = 1;
        if (!s) continue;
        count++;
        const title = t.description || cat || TX_META[t.type].label;
        const isIn = t.type === 'income' || t.type === 'receivable_collect' || t.type === 'payable_new';
        const catAcc = accById.get(t.categoryId ?? '') ?? accById.get(t.accountId ?? '');
        out.push({
          id: 't-' + t.id,
          group: 'Transaksi',
          title,
          sub: `${formatDate(t.date)} · ${t.ref}${cat && cat !== title ? ' · ' + cat : ''}`,
          right: <span className={isIn ? 'pos' : ''}>{formatMoney(t.amount)}</span>,
          icon: <IconTile icon={catAcc?.icon ?? 'receipt'} color={catAcc?.color} size="sm" />,
          run: go(() => editTx(t)),
          score: s,
        });
      }
      for (const a of data.accounts) {
        const s = match(`${a.name} ${a.code}`);
        if (!s) continue;
        out.push({
          id: 'acc-' + a.id,
          group: 'Akun',
          title: a.name,
          sub: `${a.code} · ${TYPE_LABEL[a.type]} · Buka buku besar`,
          icon: <IconTile icon={a.icon} color={a.color} size="sm" />,
          run: go(() => nav(`/buku-besar?akun=${a.id}`)),
          score: s,
        });
      }
    } else {
      const recent = [...data.transactions].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
      const accById = new Map(data.accounts.map((a) => [a.id, a]));
      for (const t of recent) {
        const catAcc = accById.get(t.categoryId ?? '') ?? accById.get(t.accountId ?? '');
        out.push({
          id: 't-' + t.id,
          group: 'Terakhir dicatat',
          title: t.description || catAcc?.name || TX_META[t.type].label,
          sub: `${formatDate(t.date)} · ${t.ref}`,
          right: formatMoney(t.amount),
          icon: <IconTile icon={catAcc?.icon ?? 'receipt'} color={catAcc?.color} size="sm" />,
          run: go(() => editTx(t)),
          score: 0,
        });
      }
    }

    const order = ['Tindakan', 'Favorit', 'Halaman', 'Transaksi', 'Akun', 'Terakhir dicatat'];
    const counts = new Map<string, number>();
    return out
      .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || b.score - a.score)
      .filter((it) => {
        if (!n) return true;
        const c = (counts.get(it.group) ?? 0) + 1;
        counts.set(it.group, c);
        return c <= (it.group === 'Transaksi' ? 12 : 6);
      });
  }, [q, data, nav, openTx, editTx, prefs, setShortcuts, onClose]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('.palette-item.active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[active]?.run();
    }
  };

  let last = '';
  return (
    <>
      <div className="palette-input">
        <Search />
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder="Cari transaksi, akun, nominal, atau perintah…"
          spellCheck={false}
          autoComplete="off"
        />
        <span className="kbd">esc</span>
      </div>
      <div className="palette-list" ref={listRef}>
        {items.length === 0 && <div className="list-empty">Tidak ada hasil untuk “{q}”</div>}
        {items.map((it, i) => {
          const head = it.group !== last ? it.group : null;
          last = it.group;
          return (
            <div key={it.id}>
              {head && <div className="list-group">{head}</div>}
              <button
                type="button"
                className={`palette-item${i === active ? ' active' : ''}`}
                onMouseMove={() => active !== i && setActive(i)}
                onClick={it.run}
              >
                {it.icon}
                <span className="col grow" style={{ minWidth: 0 }}>
                  <span className="truncate">{highlight(it.title, q.trim())}</span>
                  {it.sub && <span className="pi-sub truncate">{it.sub}</span>}
                </span>
                {it.right && <span className="pi-right">{it.right}</span>}
                {i === active && <CornerDownLeft size={15} style={{ opacity: 0.8, flex: 'none' }} />}
              </button>
            </div>
          );
        })}
      </div>
      <div className="palette-foot">
        <span>
          <span className="kbd">↑</span>
          <span className="kbd">↓</span> pilih
        </span>
        <span>
          <span className="kbd">↵</span> buka
        </span>
        <span>
          <span className="kbd">esc</span> tutup
        </span>
        <span style={{ marginLeft: 'auto' }}>{data.transactions.length.toLocaleString('id-ID')} transaksi tercatat</span>
      </div>
    </>
  );
}
