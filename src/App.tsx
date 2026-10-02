import { BrowserRouter, Route, Routes, useLocation, useSearchParams, Navigate } from 'react-router-dom';
import { motion, MotionConfig } from 'framer-motion';
import { AppShell } from './components/layout/AppShell';
import { TransactionModalHost } from './components/forms/TransactionModal';
import { CommandPalette } from './components/CommandPalette';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { ConfirmHost } from './components/ui/Confirm';
import { Toasts } from './components/ui/Toasts';
import { useThemeSync } from './hooks/useApp';
import { usePrefs } from './store/ui';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import CalendarPage from './pages/CalendarPage';
import Wallets from './pages/Wallets';
import Debts from './pages/Debts';
import Budgets from './pages/Budgets';
import Assets from './pages/Assets';
import Journal from './pages/Journal';
import Ledger from './pages/Ledger';
import TrialBalance from './pages/TrialBalance';
import Accounts from './pages/Accounts';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

/** Kalender kini tab di Transaksi (?tampil=kalender); tautan lama /kalender dialihkan dengan parameternya. */
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
  return (
    <motion.div
      key={loc.pathname}
      className="route"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </motion.div>
  );
}

export default function App() {
  useThemeSync();
  const reduceMotion = usePrefs((s) => s.reduceMotion);
  return (
    <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
      <BrowserRouter>
        <AppShell>
          <AnimatedRoutes />
        </AppShell>
        <TransactionModalHost />
        <CommandPalette />
        <ShortcutsDialog />
        <ConfirmHost />
        <Toasts />
      </BrowserRouter>
    </MotionConfig>
  );
}
