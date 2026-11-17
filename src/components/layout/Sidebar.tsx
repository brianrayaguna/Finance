/*
 * Sidebar aplikasi:
 *  kepala (merek dan tombol ciutkan), Cari dan Catat transaksi, menu berkelompok yang dapat
 *  dilipat, daftar saldo rekening, serta profil dengan menu pengaturan.
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, m as motion } from 'framer-motion';
import { useTransformFrom } from '../../lib/motion';
import {
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  Search,
  Plus,
  X,
  Eye,
  EyeOff,
  Settings as SettingsIcon,
  Palette,
  Download,
  Info,
  Sun,
  Moon,
  Monitor,
  Star,
  type Glyph,
} from '../../lib/glyphs';
import { buildNav, type NavItem } from '../../app/nav';
import { downloadBackup } from '../../app/backup';
import { usePrefs, useUI, type ThemeMode } from '../../store/ui';
import { useData } from '../../store/data';
import { useReminders } from '../../hooks/useReminders';
import { useBooks, useNarrow, useToday } from '../../hooks/useApp';
import { walletBalances } from '../../accounting/reports';
import { formatMoney, initials } from '../../lib/format';
import { Tooltip } from '../ui/Tooltip';
import { SlidePill } from '../ui/SlidePill';
import { Menu, type MenuItem } from '../ui/Popover';
import { LogoMark } from '../brand/Logo';
import { recordMenuItems } from '../tx/recordMenu';


function NavRow({
  it,
  active,
  badge,
  collapsed,
  group,
  onNavigate,
}: {
  it: NavItem;
  active: boolean;
  badge?: number;
  collapsed: boolean;
  group?: string;
  onNavigate: () => void;
}) {
  const Icon: Glyph = it.icon;
  const collapsedAriaLabel = collapsed ? (badge ? `${it.label}, ${badge} perlu perhatian` : it.label) : undefined;
  return (
    <li>
      <Tooltip
        label={
          <span className="tip-stack">
            {it.label}
            {group && <small>{group}</small>}
          </span>
        }
        side="right"
        disabled={!collapsed}
      >
        <NavLink
          to={it.to}
          end={it.to === '/'}
          className={`sb-item${active ? ' active' : ''}`}
          onClick={onNavigate}
          aria-current={active ? 'page' : undefined}
          aria-label={collapsedAriaLabel}
        >
          {active && <SlidePill group="sb-pill" className="sb-pill" duration={300} />}
          <span className="sb-ico" aria-hidden>
            <Icon solid={active} />
          </span>
          <span className="sb-text">{it.label}</span>
          {!!badge && (
            <>
              <span className="sb-badge" aria-label={`${badge} perlu perhatian`}>
                {badge}
              </span>
              <span className="sb-dot" aria-hidden />
            </>
          )}
        </NavLink>
      </Tooltip>
    </li>
  );
}

/** Bayangan pudar di tepi atas/bawah area gulir — tanda masih ada menu di luar layar. */
function useScrollEdges() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      el.dataset.top = el.scrollTop > 2 ? 'fade' : '';
      el.dataset.bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2 ? 'fade' : '';
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const c of Array.from(el.children)) ro.observe(c);
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);
  return ref;
}

/** Judul kelompok yang dapat dilipat. */
function SectionLabel({
  id,
  label,
  folded,
  onToggle,
  collapsed,
  badge,
  aside,
  icon,
}: {
  id: string;
  label: string;
  folded: boolean;
  onToggle: () => void;
  collapsed: boolean;
  badge?: number;
  aside?: ReactNode;
  icon?: ReactNode;
}) {
  if (collapsed) {
    return <div className="sb-label sb-sep" role="separator" aria-hidden="true" />;
  }
  return (
    <button
      type="button"
      className="sb-label"
      onClick={onToggle}
      aria-expanded={!folded}
      aria-controls={`sb-sec-${id}`}
      title={folded ? `Tampilkan ${label}` : `Lipat ${label}`}
    >
      {icon}
      <span className="sb-label-text">{label}</span>
      <ChevronDown className="sb-chev" aria-hidden />
      <span className="grow" />
      {badge ? (
        <span className="sb-label-badge" aria-label={`${badge} perlu perhatian`}>
          {badge}
        </span>
      ) : null}
      {aside}
    </button>
  );
}

/** Isi grup menu. Membuka/menutup tidak menganimasikan tinggi (reflow seluruh sidebar tiap frame);
 *  saat dibuka, isinya memudar & turun sedikit lewat transform. */
function Fold({ open, id, children }: { open: boolean; id: string; children: ReactNode }) {
  const tf = useTransformFrom();
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="items"
          id={`sb-sec-${id}`}
          className="sb-items"
          initial={{ opacity: 0, transform: tf('translateY(-4px)', 'translateY(0px)') }}
          animate={{ opacity: 1, transform: 'translateY(0px)' }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <ul className="sb-list">{children}</ul>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Saldo tiap dompet. */
function WalletList({ folded, onToggle, collapsed, onNavigate }: { folded: boolean; onToggle: () => void; collapsed: boolean; onNavigate: () => void }) {
  const b = useBooks();
  const today = useToday();
  const compact = usePrefs((s) => s.compactNumbers);
  const hideAmounts = usePrefs((s) => s.hideAmounts);
  const { search, pathname } = useLocation();
  const list = useMemo(() => walletBalances(b, today).filter((w) => !w.account.archived), [b, today]);
  if (!list.length || collapsed) return null;
  const signed = (w: (typeof list)[number]) => (w.account.subtype === 'credit_card' ? -w.balance : w.balance);
  const total = list.reduce((s, w) => s + signed(w), 0);
  const shown = list.slice(0, 5);
  const activeId = pathname === '/transaksi' ? new URLSearchParams(search).get('akun') : null;
  const money = (v: number) => formatMoney(v, { compact, symbol: false });
  return (
    <div className="sb-section sb-wallets">
      <SectionLabel
        id="rekening"
        label="Rekening"
        folded={folded}
        onToggle={onToggle}
        collapsed={collapsed}
        aside={<span className="sb-label-num money-val num">{formatMoney(total, { compact: true })}</span>}
      />
      <Fold open={!folded} id="rekening">
        {shown.map((w) => {
          const v = signed(w);
          return (
            <li key={w.account.id}>
              <Link
                to={`/transaksi?akun=${w.account.id}`}
                className={`sb-acct${activeId === w.account.id ? ' active' : ''}`}
                onClick={onNavigate}
                aria-current={activeId === w.account.id ? 'page' : undefined}
                title={hideAmounts ? w.account.name : `${w.account.name}: ${formatMoney(v)}`}
              >
                <span className="sb-acct-dot" style={{ background: w.account.color }} aria-hidden />
                <span className="sb-acct-name">{w.account.name}</span>
                <span className={`sb-acct-val money-val num${v < -0.004 ? ' neg' : ''}`}>{money(v)}</span>
              </Link>
            </li>
          );
        })}
        {list.length > shown.length && (
          <li>
            <Link to="/dompet" className="sb-acct sb-acct-more" onClick={onNavigate}>
              Lihat semua {list.length} rekening
            </Link>
          </li>
        )}
      </Fold>
    </div>
  );
}

const THEMES: { key: ThemeMode; label: string; icon: Glyph }[] = [
  { key: 'light', label: 'Terang', icon: Sun },
  { key: 'dark', label: 'Gelap', icon: Moon },
  { key: 'system', label: 'Ikuti sistem', icon: Monitor },
];

/** Menu profil: identitas di atas, pengaturan & tampilan, alat data, lalu info aplikasi. */
function ProfileMenu({ collapsed, onNavigate }: { collapsed: boolean; onNavigate: () => void }) {
  const profile = useData((s) => s.data.profile);
  const theme = usePrefs((s) => s.theme);
  const mode = usePrefs((s) => s.mode);
  const hideAmounts = usePrefs((s) => s.hideAmounts);
  const setPrefs = usePrefs((s) => s.set);
  const nav = useNavigate();
  const name = profile.name?.trim() || 'Pengguna';
  const book = profile.entityName?.trim() || 'Keuangan pribadi';
  const go = (to: string) => {
    onNavigate();
    nav(to);
  };

  const items: MenuItem[] = [
    { note: book },
    { label: 'Pengaturan', icon: SettingsIcon, onSelect: () => go('/pengaturan') },
    {
      label: 'Tampilan',
      icon: Palette,
      submenu: [
        ...THEMES.map((t) => ({ label: t.label, icon: t.icon, checked: theme === t.key, onSelect: () => setPrefs({ theme: t.key }) })),
        { separator: true },
        { label: 'Mode Sederhana', checked: mode === 'simple', onSelect: () => setPrefs({ mode: 'simple' }) },
        { label: 'Mode Akuntan', checked: mode === 'accountant', onSelect: () => setPrefs({ mode: 'accountant' }) },
        { separator: true },
        { label: 'Warna & kepadatan…', onSelect: () => go('/pengaturan/tampilan') },
      ],
    },
    { separator: true },
    { label: hideAmounts ? 'Tampilkan nominal' : 'Sembunyikan nominal', icon: hideAmounts ? Eye : EyeOff, onSelect: () => setPrefs({ hideAmounts: !hideAmounts }) },
    { label: 'Cadangkan data', icon: Download, onSelect: downloadBackup },
    { separator: true },
    { label: 'Tentang Keuanganku', icon: Info, onSelect: () => go('/pengaturan/tentang') },
  ];

  return (
    <Menu
      placement="top-start"
      minWidth={collapsed ? 248 : 240}
      className="profile-pop"
      items={items}
      trigger={(p) => (
        <Tooltip label={`${name}, ${book}`} side="right" disabled={!collapsed}>
          <button
            type="button"
            className="profile-chip"
            ref={p.ref}
            onClick={p.onClick}
            aria-expanded={p['aria-expanded']}
            aria-haspopup="menu"
            aria-label={`Profil ${name} — pengaturan & tampilan`}
          >
            <span className="avatar" aria-hidden>
              {initials(name)}
            </span>
            {/* Satu baris "Nama, mode Sederhana" */}
            <span className="p-meta">
              <span className="p-name">{name}</span>
              <span className="p-tag">, mode {mode === 'simple' ? 'Sederhana' : 'Akuntan'}</span>
            </span>
            <ChevronDown className="p-chev" aria-hidden />
          </button>
        </Tooltip>
      )}
    />
  );
}

export function Sidebar() {
  const collapsedPref = usePrefs((s) => s.sidebarCollapsed);
  const narrow = useNarrow();
  // hanya ikon saat desktop + diciutkan; di laci ponsel label & lipatan tetap berfungsi
  const collapsed = collapsedPref && !narrow;
  const setPrefs = usePrefs((s) => s.set);
  const setNav = usePrefs((s) => s.setNav);
  const navPrefs = usePrefs((s) => s.nav);
  const mode = usePrefs((s) => s.mode);
  const mobileNav = useUI((s) => s.mobileNav);
  const setMobileNav = useUI((s) => s.setMobileNav);
  const setPalette = useUI((s) => s.setPalette);
  const openTx = useUI((s) => s.openTx);
  const templates = useData((s) => s.data.templates);
  const loc = useLocation();
  const { dueCount, budgetOver } = useReminders();
  const navRef = useScrollEdges();

  const model = useMemo(() => buildNav(navPrefs, mode), [navPrefs, mode]);
  const folded = new Set(navPrefs.folded);

  const toggleHeader = (fromKeyboard: boolean) => {
    if (narrow) {
      setMobileNav(false);
      return;
    }
    const next = !collapsedPref;
    setPrefs({ sidebarCollapsed: next });
    if (fromKeyboard) {
      requestAnimationFrame(() => {
        const sel = next ? '#main-sidebar .brand-toggle' : '#main-sidebar .sb-toggle';
        document.querySelector<HTMLElement>(sel)?.focus();
      });
    }
  };
  const isActive = (to: string) => (to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(to));
  const closeMobile = () => setMobileNav(false);
  const badgeFor = (to: string) => (to === '/hutang-piutang' ? dueCount : to === '/anggaran' ? budgetOver : 0);
  const toggleFold = (id: string) =>
    setNav((n) => ({ ...n, folded: n.folded.includes(id) ? n.folded.filter((x) => x !== id) : [...n.folded, id] }));

  // Kelompok pertama (Ikhtisar) tampil tanpa judul; sisanya berjudul & dapat dilipat.
  const [primary, ...rest] = model.sections;
  const primaryItems = primary?.id === 'ikhtisar' ? primary.items : [];
  const sections = [
    ...(model.favorites.length ? [{ id: 'favorit', section: 'Favorit', items: model.favorites, fav: true }] : []),
    ...(primary?.id === 'ikhtisar' ? rest : model.sections).map((s) => ({ ...s, fav: false })),
  ];

  return (
    <aside
      id="main-sidebar"
      className="sidebar"
      role={narrow ? 'dialog' : undefined}
      aria-modal={narrow && mobileNav ? true : undefined}
      aria-label="Panel menu"
      inert={narrow && !mobileNav ? true : undefined}
    >
      <div className="sb-head">
        {/* Merek di kiri & tombol ciut/tutup di kanan; saat desktop diciutkan, tombol buka digabung di logo */}
        {collapsed ? (
          <Tooltip label="Buka sidebar" side="right">
            <button
              type="button"
              className="brand-toggle"
              onClick={(e) => toggleHeader(e.detail === 0)}
              aria-expanded={false}
              aria-label="Buka sidebar"
            >
              <LogoMark size={26} className="brand-mark" />
              <PanelLeftOpen className="brand-open-ico" aria-hidden />
            </button>
          </Tooltip>
        ) : (
          <>
            <Link to="/" className="brand" onClick={closeMobile} aria-label="Keuanganku — Ringkasan">
              <LogoMark size={26} className="brand-mark" />
              <span className="brand-name">Keuanganku</span>
            </Link>
            <Tooltip label={narrow ? 'Tutup menu' : 'Ciutkan sidebar'} side="bottom">
              <button
                type="button"
                className="sb-icon sb-toggle"
                onClick={(e) => toggleHeader(e.detail === 0)}
                aria-expanded={narrow ? mobileNav : true}
                aria-label={narrow ? 'Tutup menu' : 'Ciutkan sidebar'}
              >
                {narrow ? <X aria-hidden /> : <PanelLeftClose aria-hidden />}
              </button>
            </Tooltip>
          </>
        )}
      </div>

      <div className="sb-actions">
        <Tooltip label="Cari transaksi, akun, atau menu" side="right" disabled={!collapsed}>
          <button type="button" className="sb-search" onClick={() => setPalette(true)} aria-label="Cari transaksi, akun, atau menu">
            <Search aria-hidden />
            <span className="sb-text">Cari</span>
          </button>
        </Tooltip>
        <div className="sb-new">
          <Tooltip label="Catat transaksi" side="right" disabled={!collapsed}>
            <button type="button" className="sb-item sb-primary" onClick={() => openTx()} aria-label={collapsed ? 'Catat transaksi' : undefined}>
              <span className="sb-plus" aria-hidden>
                <Plus />
              </span>
              <span className="sb-text">Catat transaksi</span>
            </button>
          </Tooltip>
          {!collapsed && (
            <Menu
              placement="bottom-end"
              minWidth={236}
              items={recordMenuItems(openTx, mode, templates)}
              trigger={(p) => (
                <button
                  type="button"
                  className="sb-new-more"
                  ref={p.ref}
                  onClick={p.onClick}
                  aria-expanded={p['aria-expanded']}
                  aria-haspopup="menu"
                  aria-label="Pilih jenis transaksi atau favorit"
                >
                  <ChevronDown aria-hidden />
                </button>
              )}
            />
          )}
        </div>
      </div>

      <nav className="sb-nav" data-pill-root ref={navRef as React.RefObject<HTMLElement>} aria-label="Utama">
        {primaryItems.length > 0 && (
          <div className="sb-section sb-primary-group">
            <ul className="sb-list">
              {primaryItems.map((it) => (
                <NavRow key={it.to} it={it} active={isActive(it.to)} badge={badgeFor(it.to)} collapsed={collapsed} onNavigate={closeMobile} />
              ))}
            </ul>
          </div>
        )}

        {sections.map((sec) => {
          const isFolded = !collapsed && folded.has(sec.id);
          const activeInside = sec.items.find((i) => isActive(i.to));
          // lencana menu yang tersembunyi di kelompok terlipat tetap diberitahukan
          const hiddenBadge = isFolded ? sec.items.filter((i) => i !== activeInside).reduce((n, i) => n + badgeFor(i.to), 0) : 0;
          return (
            <div className={`sb-section${sec.fav ? ' fav' : ''}`} key={sec.id}>
              <SectionLabel
                id={sec.id}
                label={sec.section}
                folded={isFolded}
                onToggle={() => toggleFold(sec.id)}
                collapsed={collapsed}
                badge={hiddenBadge}
                icon={sec.fav ? <Star solid className="sb-fav-ico" aria-hidden /> : undefined}
              />
              <Fold open={!isFolded} id={sec.id}>
                {sec.items.map((it) => (
                  <NavRow key={it.to} it={it} active={isActive(it.to)} badge={badgeFor(it.to)} collapsed={collapsed} group={sec.section} onNavigate={closeMobile} />
                ))}
              </Fold>
              {/* Halaman aktif tetap terlihat walau kelompoknya dilipat */}
              {isFolded && activeInside && (
                <ul className="sb-list">
                  <NavRow it={activeInside} active badge={badgeFor(activeInside.to)} collapsed={collapsed} group={sec.section} onNavigate={closeMobile} />
                </ul>
              )}
            </div>
          );
        })}

        <WalletList folded={folded.has('rekening')} onToggle={() => toggleFold('rekening')} collapsed={collapsed} onNavigate={closeMobile} />
      </nav>

      <div className="sb-foot">
        <ProfileMenu collapsed={collapsed} onNavigate={closeMobile} />
      </div>
    </aside>
  );
}
