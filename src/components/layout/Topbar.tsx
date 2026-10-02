import { useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu as MenuIcon, Search, Undo2, Redo2, Plus, Bell, BellOff, ChevronDown, ChevronRight } from 'lucide-react';
import { ALL_NAV, navLabel, navSection } from '../../app/nav';
import { REPORTS } from '../../app/reports';
import { usePrefs, useUI } from '../../store/ui';
import { useData } from '../../store/data';
import { undo, redo } from '../../store/history';
import { useScrolled } from '../../hooks/useApp';
import { useReminders } from '../../hooks/useReminders';
import { MOD } from '../../lib/layers';
import { Tooltip } from '../ui/Tooltip';
import { Menu, Popover } from '../ui/Popover';
import { IconTile } from '../ui/primitives';
import { LogoMark } from '../brand/Logo';
import { recordMenuItems } from '../tx/recordMenu';

export function Topbar() {
  const scrolled = useScrolled(8);
  const setPalette = useUI((s) => s.setPalette);
  const setMobileNav = useUI((s) => s.setMobileNav);
  const canUndo = useData((s) => s.past.length > 0);
  const canRedo = useData((s) => s.future.length > 0);
  const nextLabel = useData((s) => s.past[s.past.length - 1]?.label);
  const redoLabel = useData((s) => s.future[0]?.label);

  // Desktop: Cari & Catat ada di sidebar, jadi bilah atas hanya berisi konteks halaman.
  // Tablet/ponsel (sidebar tersembunyi): ikon cari & tombol catat muncul di sini.
  return (
    <header className={`topbar no-print${scrolled ? ' scrolled' : ''}`}>
      <div className="tb-left">
        <button type="button" className="tb-btn tb-menu" onClick={() => setMobileNav(true)} aria-label="Buka menu">
          <MenuIcon />
        </button>
        <LogoMark size={26} className="tb-logo" />
        <Breadcrumb />
      </div>

      <div className="tb-right">
        {/* Urungkan/ulangi hanya muncul bila ada tindakan yang bisa diurungkan */}
        <AnimatePresence initial={false}>
          {(canUndo || canRedo) && (
            <motion.div
              className="tb-cluster tb-undo-group"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.16 }}
            >
              <Tooltip label={canUndo ? `Urungkan: ${nextLabel}` : 'Urungkan'} kbd={[MOD, 'Z']}>
                <button type="button" className="tb-btn" onClick={undo} disabled={!canUndo} aria-label="Urungkan">
                  <Undo2 />
                </button>
              </Tooltip>
              <Tooltip label={canRedo ? `Ulangi: ${redoLabel}` : 'Ulangi'} kbd={[MOD, '⇧', 'Z']}>
                <button type="button" className="tb-btn" onClick={redo} disabled={!canRedo} aria-label="Ulangi">
                  <Redo2 />
                </button>
              </Tooltip>
            </motion.div>
          )}
        </AnimatePresence>
        <Tooltip label="Cari" kbd={[MOD, 'K']}>
          <button type="button" className="tb-btn tb-search-icon" onClick={() => setPalette(true)} aria-label="Cari transaksi, akun, atau menu">
            <Search />
          </button>
        </Tooltip>
        <ReminderBell />
        <RecordButton />
      </div>
    </header>
  );
}

/** Jejak halaman: kelompok › halaman › (laporan/akun yang sedang dibuka) */
function Breadcrumb() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const accounts = useData((s) => s.data.accounts);
  const section = navSection(pathname);
  const page = navLabel(pathname);
  let extra: string | undefined;
  if (pathname.startsWith('/laporan')) extra = REPORTS.find((r) => r.key === params.get('r'))?.label ?? REPORTS[0].label;
  if (pathname.startsWith('/buku-besar')) extra = accounts.find((a) => a.id === params.get('akun'))?.name;
  const pageRoot = ALL_NAV.find((n) => n.label === page)?.to ?? '/';
  return (
    <nav className="crumbs" aria-label="Lokasi halaman">
      <ol>
        {section && <li className="crumb-sec">{section}</li>}
        <li className={extra ? 'crumb-page' : 'crumb-page current'} aria-current={extra ? undefined : 'page'}>
          {extra ? <Link to={pageRoot}>{page}</Link> : page}
        </li>
        {extra && (
          <li className="crumb-extra current" aria-current="page">
            {extra}
          </li>
        )}
      </ol>
    </nav>
  );
}

/** Lonceng pengingat: jatuh tempo, anggaran terlampaui, masalah integritas */
function ReminderBell() {
  const { items } = useReminders();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const nav = useNavigate();
  const urgent = items.filter((i) => i.tone === 'neg').length;
  return (
    <>
      <Tooltip label={items.length ? `${items.length} pengingat` : 'Pengingat'}>
        <button
          type="button"
          ref={ref}
          className={`tb-btn tb-bell${open ? ' on' : ''}`}
          onClick={() => setOpen((v) => !v)}
          aria-label={items.length ? `Pengingat, ${items.length} perlu perhatian` : 'Pengingat'}
          aria-expanded={open}
        >
          <Bell />
          {items.length > 0 && <span className={`tb-count${urgent ? ' neg' : ''}`}>{items.length > 9 ? '9+' : items.length}</span>}
        </button>
      </Tooltip>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} placement="bottom-end" width={348} autoFocus>
        <div className="rem">
          <div className="rem-head">
            <strong>Pengingat</strong>
            <span className="muted">{items.length ? `${items.length} perlu perhatian` : 'Semua beres'}</span>
          </div>
          {items.length === 0 ? (
            <div className="rem-empty">
              <BellOff />
              <span>Tidak ada tagihan jatuh tempo, anggaran terlampaui, atau masalah buku.</span>
            </div>
          ) : (
            <div className="rem-list">
              {items.map((r) => (
                <button
                  type="button"
                  key={r.id}
                  className="rem-item"
                  data-tone={r.tone}
                  onClick={() => {
                    setOpen(false);
                    nav(r.to);
                  }}
                >
                  <IconTile icon={r.icon} color={r.tone === 'neg' ? 'var(--neg)' : 'var(--warn)'} size="sm" />
                  <span className="grow">
                    <strong className="truncate">{r.title}</strong>
                    <span className="muted">
                      {r.detail}
                      {r.when && (
                        <>
                          {' · '}
                          <span className="rem-when">{r.when}</span>
                        </>
                      )}
                    </span>
                  </span>
                  <ChevronRight className="rem-chev" />
                </button>
              ))}
            </div>
          )}
        </div>
      </Popover>
    </>
  );
}

/** Tombol "Catat transaksi" + pilihan jenis & favorit — hanya tampil saat sidebar tersembunyi (tablet). */
function RecordButton() {
  const openTx = useUI((s) => s.openTx);
  const mode = usePrefs((s) => s.mode);
  const templates = useData((s) => s.data.templates);
  const items = recordMenuItems(openTx, mode, templates);
  return (
    <div className="split-btn tb-record">
      <Tooltip label="Catat transaksi baru" kbd={['N']}>
        <button type="button" className="btn btn-primary tb-cta" onClick={() => openTx()}>
          <Plus aria-hidden />
          <span className="tb-cta-label">Catat transaksi</span>
        </button>
      </Tooltip>
      <Menu
        placement="bottom-end"
        minWidth={236}
        items={items}
        trigger={(p) => (
          <button type="button" className="btn btn-primary tb-cta-more" ref={p.ref} onClick={p.onClick} aria-expanded={p['aria-expanded']} aria-label="Pilih jenis transaksi atau favorit">
            <ChevronDown aria-hidden />
          </button>
        )}
      />
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Label kecil opsional di atas judul (kelompok navigasi sudah tampil di jejak halaman). */
  eyebrow?: ReactNode;
}) {
  // Nama kelompok kini tampil di jejak halaman (bilah atas), bukan sebagai label di atas judul.
  return (
    <header className="page-head">
      <div className="ph-main">
        {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions no-print">{actions}</div>}
    </header>
  );
}
