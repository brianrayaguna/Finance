/*
 * Sidebar bergaya Claude untuk aplikasi keuangan:
 *  kepala (merek + ciutkan) · Cari & Catat transaksi · menu berkelompok yang dapat dilipat ·
 *  daftar saldo rekening · profil dengan menu pengaturan (pola menu akun Claude).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
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
  Keyboard,
  Download,
  Info,
  Sun,
  Moon,
  Monitor,
  Star,
  type LucideIcon,
} from 'lucide-react';
import { buildNav, toneOf, type NavItem } from '../../app/nav';
import { downloadBackup } from '../../app/backup';
import { usePrefs, useUI, type ThemeMode } from '../../store/ui';
import { useData } from '../../store/data';
import { useReminders } from '../../hooks/useReminders';
import { useBooks, useToday } from '../../hooks/useApp';
import { walletBalances } from '../../accounting/reports';
import { formatMoney, initials } from '../../lib/format';
import { ALT, MOD, isMac } from '../../lib/layers';
import { Tooltip } from '../ui/Tooltip';
import { Menu, type MenuItem } from '../ui/Popover';
import { LogoMark } from '../brand/Logo';
import { recordMenuItems } from '../tx/recordMenu';

const SPRING = { type: 'spring', stiffness: 560, damping: 44, mass: 0.7 } as const;

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
  const Icon: LucideIcon = it.icon;
  return (
    <Tooltip
      label={
        <span className="tip-stack">
          {it.label}
          {group && <small>{group}</small>}
        </span>
      }
      side="right"
      disabled={!collapsed}
      kbd={it.hotkey ? [ALT, it.hotkey] : undefined}
    >
      <NavLink
        to={it.to}
        end={it.to === '/'}
        className={`sb-item${active ? ' active' : ''}`}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        aria-label={collapsed ? it.label : undefined}
      >
        {active && <motion.span layoutId="sb-pill" className="sb-pill" transition={SPRING} />}
        <span className="sb-ico" style={{ '--tone': toneOf(it.to) } as CSSProperties} aria-hidden>
          <Icon />
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
  );
}

/** Layar sempit: sidebar tampil sebagai laci penuh walau preferensi "ciut" aktif. */
function useNarrow() {
  const q = '(max-width: 960px)';
  const [narrow, setNarrow] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
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

/** Judul kelompok yang dapat dilipat (pola "Projects/Recents" di Claude). */
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
  return (
    <button
      type="button"
      className="sb-label"
      onClick={onToggle}
      aria-expanded={!folded}
      aria-controls={`sb-sec-${id}`}
      tabIndex={collapsed ? -1 : 0}
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

const Fold = ({ open, id, children }: { open: boolean; id: string; children: ReactNode }) => (
  <AnimatePresence initial={false}>
    {open && (
      <motion.div
        key="items"
        id={`sb-sec-${id}`}
        className="sb-items"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      >
        {children}
      </motion.div>
    )}
  </AnimatePresence>
);

/** Saldo tiap dompet — padanan daftar percakapan terbaru di sidebar Claude. */
function WalletList({ folded, onToggle, collapsed, onNavigate }: { folded: boolean; onToggle: () => void; collapsed: boolean; onNavigate: () => void }) {
  const b = useBooks();
  const today = useToday();
  const compact = usePrefs((s) => s.compactNumbers);
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
            <Link
              key={w.account.id}
              to={`/transaksi?akun=${w.account.id}`}
              className={`sb-acct${activeId === w.account.id ? ' active' : ''}`}
              onClick={onNavigate}
              aria-current={activeId === w.account.id ? 'page' : undefined}
              title={`${w.account.name} · ${formatMoney(v)}`}
            >
              <span className="sb-acct-dot" style={{ background: w.account.color }} aria-hidden />
              <span className="sb-acct-name">{w.account.name}</span>
              <span className={`sb-acct-val money-val num${v < -0.004 ? ' neg' : ''}`}>{money(v)}</span>
            </Link>
          );
        })}
        {list.length > shown.length && (
          <Link to="/dompet" className="sb-acct sb-acct-more" onClick={onNavigate}>
            Lihat semua {list.length} rekening
          </Link>
        )}
      </Fold>
    </div>
  );
}

const THEMES: { key: ThemeMode; label: string; icon: LucideIcon }[] = [
  { key: 'light', label: 'Terang', icon: Sun },
  { key: 'dark', label: 'Gelap', icon: Moon },
  { key: 'system', label: 'Ikuti sistem', icon: Monitor },
];

/** Menu profil ala Claude: identitas di atas, pengaturan & tampilan, alat data, lalu info aplikasi. */
function ProfileMenu({ collapsed, onNavigate }: { collapsed: boolean; onNavigate: () => void }) {
  const profile = useData((s) => s.data.profile);
  const theme = usePrefs((s) => s.theme);
  const mode = usePrefs((s) => s.mode);
  const hideAmounts = usePrefs((s) => s.hideAmounts);
  const setPrefs = usePrefs((s) => s.set);
  const setShortcuts = useUI((s) => s.setShortcuts);
  const nav = useNavigate();
  const name = profile.name?.trim() || 'Pengguna';
  const book = profile.entityName?.trim() || 'Keuangan pribadi';
  const go = (to: string) => {
    onNavigate();
    nav(to);
  };

  const items: MenuItem[] = [
    { note: book },
    { label: 'Pengaturan', icon: SettingsIcon, kbd: isMac ? '⌘ ,' : 'Ctrl ,', onSelect: () => go('/pengaturan') },
    {
      label: 'Tampilan',
      icon: Palette,
      submenu: [
        ...THEMES.map((t) => ({ label: t.label, icon: t.icon, checked: theme === t.key, onSelect: () => setPrefs({ theme: t.key }) })),
        { separator: true },
        { label: 'Mode Sederhana', checked: mode === 'simple', onSelect: () => setPrefs({ mode: 'simple' }) },
        { label: 'Mode Akuntan', checked: mode === 'accountant', onSelect: () => setPrefs({ mode: 'accountant' }) },
        { separator: true },
        { label: 'Warna & kepadatan…', onSelect: () => go('/pengaturan#tampilan') },
      ],
    },
    { label: 'Pintasan keyboard', icon: Keyboard, kbd: '?', onSelect: () => setShortcuts(true) },
    { separator: true },
    { label: hideAmounts ? 'Tampilkan nominal' : 'Sembunyikan nominal', icon: hideAmounts ? Eye : EyeOff, kbd: 'H', onSelect: () => setPrefs({ hideAmounts: !hideAmounts }) },
    { label: 'Cadangkan data', icon: Download, onSelect: downloadBackup },
    { separator: true },
    { label: 'Tentang Keuanganku', icon: Info, onSelect: () => go('/pengaturan#tentang') },
  ];

  return (
    <Menu
      placement="top-start"
      minWidth={collapsed ? 248 : 240}
      className="profile-pop"
      items={items}
      trigger={(p) => (
        <Tooltip label={`${name} · ${book}`} side="right" disabled={!collapsed}>
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
            {/* Satu baris "Nama · Mode" — padanan "Brian · Pro" di Claude */}
            <span className="p-meta">
              <span className="p-name">{name}</span>
              <span className="p-tag"> · {mode === 'simple' ? 'Sederhana' : 'Akuntan'}</span>
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
  const hideAmounts = usePrefs((s) => s.hideAmounts);
  const navPrefs = usePrefs((s) => s.nav);
  const mode = usePrefs((s) => s.mode);
  const setMobileNav = useUI((s) => s.setMobileNav);
  const setPalette = useUI((s) => s.setPalette);
  const openTx = useUI((s) => s.openTx);
  const templates = useData((s) => s.data.templates);
  const loc = useLocation();
  const { dueCount, budgetOver } = useReminders();
  const navRef = useScrollEdges();

  const model = useMemo(() => buildNav(navPrefs, mode), [navPrefs, mode]);
  const folded = new Set(navPrefs.folded);

  const toggle = () => {
    if (narrow) setMobileNav(false);
    else setPrefs({ sidebarCollapsed: !collapsedPref });
  };
  const isActive = (to: string) => (to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(to));
  const closeMobile = () => setMobileNav(false);
  const badgeFor = (to: string) => (to === '/hutang-piutang' ? dueCount : to === '/anggaran' ? budgetOver : 0);
  const toggleFold = (id: string) =>
    setNav((n) => ({ ...n, folded: n.folded.includes(id) ? n.folded.filter((x) => x !== id) : [...n.folded, id] }));

  // Kelompok pertama (Ikhtisar) tampil tanpa judul, seperti menu utama Claude; sisanya berjudul & dapat dilipat.
  const [primary, ...rest] = model.sections;
  const primaryItems = primary?.id === 'ikhtisar' ? primary.items : [];
  const sections = [
    ...(model.favorites.length ? [{ id: 'favorit', section: 'Favorit', items: model.favorites, fav: true }] : []),
    ...(primary?.id === 'ikhtisar' ? rest : model.sections).map((s) => ({ ...s, fav: false })),
  ];

  return (
    <aside className="sidebar" aria-label="Navigasi utama">
      <div className="sb-head">
        {/* Tombol tutup/buka di kiri, sebelum merek — satu tempat yang konsisten di desktop dan laci ponsel */}
        <Tooltip label={narrow ? 'Tutup menu' : collapsed ? 'Buka sidebar' : 'Tutup sidebar'} kbd={narrow ? undefined : [MOD, 'B']} side={collapsed ? 'right' : 'bottom'}>
          <button type="button" className="sb-icon sb-toggle" onClick={toggle} aria-label={narrow ? 'Tutup menu' : collapsed ? 'Buka sidebar' : 'Tutup sidebar'}>
            {narrow ? <X aria-hidden /> : collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
          </button>
        </Tooltip>
        <Link to="/" className="brand" onClick={closeMobile} aria-label="Keuanganku — Ringkasan" tabIndex={collapsed ? -1 : 0}>
          <LogoMark size={26} className="brand-mark" />
          <span className="brand-name">Keuanganku</span>
        </Link>
      </div>

      <div className="sb-actions">
        <Tooltip label="Cari transaksi, akun, atau menu" kbd={[MOD, 'K']} side="right" disabled={!collapsed}>
          <button type="button" className="sb-search" onClick={() => setPalette(true)} aria-label="Cari transaksi, akun, atau menu">
            <Search aria-hidden />
            <span className="sb-text">Cari</span>
            <span className="sb-kbd" aria-hidden>
              {isMac ? '⌘K' : 'Ctrl K'}
            </span>
          </button>
        </Tooltip>
        <div className="sb-new">
          <Tooltip label="Catat transaksi" kbd={['N']} side="right" disabled={!collapsed}>
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

      <nav className="sb-nav" ref={navRef as React.RefObject<HTMLElement>} aria-label="Halaman">
        {primaryItems.length > 0 && (
          <div className="sb-section sb-primary-group">
            {primaryItems.map((it) => (
              <NavRow key={it.to} it={it} active={isActive(it.to)} badge={badgeFor(it.to)} collapsed={collapsed} onNavigate={closeMobile} />
            ))}
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
                icon={sec.fav ? <Star className="sb-fav-ico" aria-hidden /> : undefined}
              />
              <Fold open={!isFolded} id={sec.id}>
                {sec.items.map((it) => (
                  <NavRow key={it.to} it={it} active={isActive(it.to)} badge={badgeFor(it.to)} collapsed={collapsed} group={sec.section} onNavigate={closeMobile} />
                ))}
              </Fold>
              {/* Halaman aktif tetap terlihat walau kelompoknya dilipat */}
              {isFolded && activeInside && (
                <NavRow it={activeInside} active badge={badgeFor(activeInside.to)} collapsed={collapsed} group={sec.section} onNavigate={closeMobile} />
              )}
            </div>
          );
        })}

        <WalletList folded={folded.has('rekening')} onToggle={() => toggleFold('rekening')} collapsed={collapsed} onNavigate={closeMobile} />
      </nav>

      <div className="sb-foot">
        <ProfileMenu collapsed={collapsed} onNavigate={closeMobile} />
        <Tooltip label={hideAmounts ? 'Tampilkan nominal' : 'Sembunyikan nominal'} kbd={['H']} side="top">
          <button
            type="button"
            className={`sb-icon sb-privacy${hideAmounts ? ' on' : ''}`}
            onClick={() => setPrefs({ hideAmounts: !hideAmounts })}
            aria-pressed={hideAmounts}
            aria-label="Sembunyikan nominal"
          >
            {hideAmounts ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}
