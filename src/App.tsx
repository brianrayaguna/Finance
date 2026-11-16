import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes, useLocation, useSearchParams, Navigate } from 'react-router-dom';
import { LazyMotion, MotionConfig } from 'framer-motion';
import { AppShell } from './components/layout/AppShell';
import { TransactionModalHost } from './components/forms/TransactionModal';
import { NativeBack } from './app/NativeBack';
import { CommandPalette } from './components/CommandPalette';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { ConfirmHost } from './components/ui/Confirm';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { Dots } from './components/ui/primitives';
import { Toasts } from './components/ui/Toasts';
import { Intro } from './components/brand/Intro';
import { useThemeSync } from './hooks/useApp';
import { usePrefs } from './store/ui';
import Dashboard from './pages/Dashboard';

/** Fitur animasi framer-motion (±100 KB) dimuat setelah tampilan pertama, bukan di bundel awal. */
const motionFeatures = () => import('./lib/motionFeatures').then((m) => m.default);

const Transactions = lazy(() => import('./pages/Transactions'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const Wallets = lazy(() => import('./pages/Wallets'));
const Debts = lazy(() => import('./pages/Debts'));
const Budgets = lazy(() => import('./pages/Budgets'));
const Assets = lazy(() => import('./pages/Assets'));
const Journal = lazy(() => import('./pages/Journal'));
const Ledger = lazy(() => import('./pages/Ledger'));
const TrialBalance = lazy(() => import('./pages/TrialBalance'));
const Accounts = lazy(() => import('./pages/Accounts'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));

function PageFallback() {
  return (
    <div className="page-loading" role="status" aria-live="polite" aria-label="Memuat halaman">
      <Dots />
    </div>
  );
}

/** Kalender adalah tab di Transaksi (?tampil=kalender); /kalender dialihkan dengan parameternya. */
function TransaksiRoute() {
  const [params] = useSearchParams();
  return params.get('tampil') === 'kalender' ? <CalendarPage /> : <Transactions />;
}

function KalenderRedirect() {
  const { search } = useLocation();
  const rest = search.replace(/^\?/, '');
  return <Navigate to={`/transaksi?tampil=kalender${rest ? `&${rest}` : ''}`} replace />;
}

function AnimatedRoutes() {
  const loc = useLocation();
  // Kunci per halaman induk (/pengaturan/profil → /pengaturan) agar pindah sub-bagian tidak
  // me-remount & menganimasikan ulang seluruh halaman.
  const section = '/' + (loc.pathname.split('/')[1] ?? '');
  return (
    <div key={section} className="route">
      <ErrorBoundary resetKey={loc.pathname}>
        <Suspense fallback={<PageFallback />}>
          <Routes location={loc}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/transaksi" element={<TransaksiRoute />} />
            <Route path="/kalender" element={<KalenderRedirect />} />
            <Route path="/dompet" element={<Wallets />} />
            <Route path="/hutang-piutang" element={<Debts />} />
            <Route path="/anggaran" element={<Budgets />} />
            <Route path="/aset" element={<Assets />} />
            <Route path="/jurnal" element={<Journal />} />
            <Route path="/buku-besar" element={<Ledger />} />
            <Route path="/neraca-saldo" element={<TrialBalance />} />
            <Route path="/akun" element={<Accounts />} />
            <Route path="/laporan" element={<Reports />} />
            <Route path="/pengaturan" element={<Settings />} />
            <Route path="/pengaturan/:bagian" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

export default function App() {
  useThemeSync();
  const reduceMotion = usePrefs((s) => s.reduceMotion);
  return (
    <LazyMotion features={motionFeatures}>
      <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
        <ErrorBoundary variant="root">
          <BrowserRouter>
            <AppShell>
              <AnimatedRoutes />
            </AppShell>
            <TransactionModalHost />
            <CommandPalette />
            <ShortcutsDialog />
            <ConfirmHost />
            <Toasts />
            <NativeBack />
          </BrowserRouter>
          <Intro />
        </ErrorBoundary>
      </MotionConfig>
    </LazyMotion>
  );
}
