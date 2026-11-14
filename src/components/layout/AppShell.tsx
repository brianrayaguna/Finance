import { useEffect, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutGrid, ArrowLeftRight, Wallet, Menu as MenuIcon, Plus } from '../../lib/glyphs';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { usePrefs, useUI } from '../../store/ui';
import { useGlobalHotkeys } from '../../app/hotkeys';
import { navLabel } from '../../app/nav';
import { useLayer } from '../../lib/layers';

export function AppShell({ children }: { children: ReactNode }) {
  const collapsed = usePrefs((s) => s.sidebarCollapsed);
  const mobileNav = useUI((s) => s.mobileNav);
  const setMobileNav = useUI((s) => s.setMobileNav);
  const { pathname, hash } = useLocation();
  const landing = usePrefs((s) => s.landing);
  const nav = useNavigate();
  useGlobalHotkeys();

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
  // Judul tab mengikuti halaman aktif, mis. "Transaksi · Keuanganku"
  useEffect(() => {
    const label = navLabel(pathname);
    document.title = label === 'Keuanganku' ? 'Keuanganku' : `${label} · Keuanganku`;
  }, [pathname]);
  return (
    <div className={`app${collapsed ? ' collapsed' : ''}${mobileNav ? ' nav-open' : ''}`}>
      <Sidebar />
      <AnimatePresence>
        {mobileNav && (
          <motion.div
            className="nav-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileNav(false)}
          />
        )}
      </AnimatePresence>
      <div className="main">
        <Topbar />
        <main className="page">{children}</main>
      </div>
      <TabBar />
    </div>
  );
}

/** Navigasi bawah untuk layar ponsel: halaman utama + tombol catat melayang */
function TabBar() {
  const openTx = useUI((s) => s.openTx);
  const mobileNav = useUI((s) => s.mobileNav);
  const setMobileNav = useUI((s) => s.setMobileNav);
  return (
    <nav className="tabbar no-print" aria-label="Navigasi cepat">
      <NavLink to="/" end className="tab">
        {({ isActive }) => (
          <>
            <span className="tab-ico">
              <LayoutGrid solid={isActive} />
            </span>
            <span>Ringkasan</span>
          </>
        )}
      </NavLink>
      <NavLink to="/transaksi" className="tab">
        {({ isActive }) => (
          <>
            <span className="tab-ico">
              <ArrowLeftRight solid={isActive} />
            </span>
            <span>Transaksi</span>
          </>
        )}
      </NavLink>
      <button type="button" className="tab tab-add" onClick={() => openTx()} aria-label="Catat transaksi">
        <span className="tab-fab">
          <Plus />
        </span>
      </button>
      <NavLink to="/dompet" className="tab">
        {({ isActive }) => (
          <>
            <span className="tab-ico">
              <Wallet solid={isActive} />
            </span>
            <span>Dompet</span>
          </>
        )}
      </NavLink>
      <button type="button" className={`tab${mobileNav ? ' active' : ''}`} onClick={() => setMobileNav(!mobileNav)} aria-expanded={mobileNav} aria-label="Menu lainnya">
        <span className="tab-ico">
          <MenuIcon />
        </span>
        <span>Lainnya</span>
      </button>
    </nav>
  );
}
