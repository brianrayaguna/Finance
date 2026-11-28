import { useEffect, useRef, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, m as motion } from 'framer-motion';
import { Plus } from '../../lib/glyphs';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { usePrefs, useUI } from '../../store/ui';
import { useWindowClass } from '../../hooks/useApp';
import { useGlobalHotkeys } from '../../app/hotkeys';
import { sidebarRail } from '../../app/breakpoints';
import { navLabel, resolveTabBar } from '../../app/nav';
import { useLayer } from '../../lib/layers';

export function AppShell({ children }: { children: ReactNode }) {
  const collapsedPref = usePrefs((s) => s.sidebarCollapsed);
  const windowClass = useWindowClass();
  const mobileNav = useUI((s) => s.mobileNav);
  const setMobileNav = useUI((s) => s.setMobileNav);
  // Di bawah expanded, sidebar penuh hanya tampil sebagai laci di atas konten (compact: dari logo,
  // medium: dari tombol di rail).
  const drawerOpen = windowClass !== 'expanded' && mobileNav;
  const rail = sidebarRail(windowClass, collapsedPref, mobileNav);
  const { pathname, hash } = useLocation();
  const landing = usePrefs((s) => s.landing);
  const nav = useNavigate();
  useGlobalHotkeys();

  useEffect(() => {
    if (windowClass === 'expanded' && mobileNav) setMobileNav(false);
  }, [windowClass, mobileNav, setMobileNav]);

  const prevDrawer = useRef(false);
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const wasOpen = prevDrawer.current;
    prevDrawer.current = drawerOpen;
    if (drawerOpen && !wasOpen) {
      // Tombol rail di medium sudah dilepas saat efek ini berjalan, sehingga yang aktif adalah body.
      const active = document.activeElement;
      openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
      const raf = requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('#main-sidebar .sb-toggle')?.focus();
      });
      return () => cancelAnimationFrame(raf);
    }
    if (!drawerOpen && wasOpen) {
      const opener = openerRef.current;
      openerRef.current = null;
      // Tanpa pembuka yang masih terpasang, fokus kembali ke tombol rail yang dipasang ulang (medium).
      const raf = requestAnimationFrame(() => {
        const target =
          opener && document.contains(opener) ? opener : document.querySelector<HTMLElement>('#main-sidebar .brand-toggle');
        target?.focus();
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [drawerOpen]);

  // Halaman pembuka pilihan pengguna — hanya sekali per sesi, saat aplikasi dibuka di Ringkasan.
  useEffect(() => {
    let landed = false;
    try {
      landed = sessionStorage.getItem('neraca.landed') === '1';
      sessionStorage.setItem('neraca.landed', '1');
    } catch {
      /* penyimpanan sesi tidak tersedia */
    }
    if (!landed && pathname === '/' && landing !== '/') nav(landing, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tautan #bagian (mis. /pengaturan#data, /anggaran#target) menggulir ke bagian tersebut.
  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    const t = window.setTimeout(() => {
      const el = document.getElementById(id) ?? document.getElementById(`set-${id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: id === 'integritas' ? 'center' : 'start' });
    }, 360);
    return () => window.clearTimeout(t);
  }, [pathname, hash]);

  useLayer(mobileNav, () => setMobileNav(false));
  // Judul tab mengikuti halaman aktif, mis. "Transaksi – Keuanganku"
  useEffect(() => {
    const label = navLabel(pathname);
    document.title = label === 'Keuanganku' ? 'Keuanganku' : `${label} – Keuanganku`;
  }, [pathname]);
  return (
    <div className={`app${rail ? ' collapsed' : ''}${drawerOpen ? ' nav-open' : ''}`}>
      <a href="#main-content" className="skip-link">
        Lewati ke konten utama
      </a>
      <Sidebar />
      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            className="nav-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileNav(false)}
          />
        )}
      </AnimatePresence>
      <div className="main" inert={drawerOpen ? true : undefined}>
        <Topbar />
        <main id="main-content" tabIndex={-1} className="page">
          {children}
        </main>
      </div>
      <TabBar inert={drawerOpen} />
    </div>
  );
}

/** Navigasi bawah untuk layar ponsel: 4 slot dari prefs + tombol catat melayang */
function TabBar({ inert }: { inert?: boolean }) {
  const openTx = useUI((s) => s.openTx);
  const navPrefs = usePrefs((s) => s.nav);
  const tabs = resolveTabBar(navPrefs);
  return (
    <nav className="tabbar no-print" aria-label="Menu bawah" inert={inert ? true : undefined}>
      {tabs.slice(0, 2).map((t, i) => (
        <NavLink key={`t${i}-${t.to}`} to={t.to} end={t.to === '/'} className="tab">
          {({ isActive }) => (
            <>
              <span className="tab-ico" aria-hidden>
                <t.icon solid={isActive} />
              </span>
              <span>{t.label}</span>
            </>
          )}
        </NavLink>
      ))}
      <button type="button" className="tab tab-add" onClick={() => openTx()} aria-label="Catat transaksi">
        <span className="tab-fab" aria-hidden>
          <Plus />
        </span>
      </button>
      {tabs.slice(2, 4).map((t, i) => (
        <NavLink key={`t${i + 2}-${t.to}`} to={t.to} end={t.to === '/'} className="tab">
          {({ isActive }) => (
            <>
              <span className="tab-ico" aria-hidden>
                <t.icon solid={isActive} />
              </span>
              <span>{t.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
