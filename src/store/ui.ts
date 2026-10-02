import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Transaction, TxType } from '../accounting/types';
import { uid } from '../lib/format';
import { defaultLayout, sanitizeLayout, type DashLayout } from '../app/dashboardLayout';
import { defaultNavPrefs, sanitizeNavPrefs, type NavPrefs, type UiMode } from '../app/nav';
import type { PresetKey } from '../components/ui/PeriodPicker';
import type { WeekStart } from '../lib/week';

export type ThemeMode = 'light' | 'dark' | 'system';
export type Accent = 'forest' | 'ocean' | 'plum' | 'clay' | 'graphite';

export const ACCENTS: { key: Accent; name: string; color: string; dark: string }[] = [
  { key: 'forest', name: 'Hijau hutan', color: '#263E35', dark: '#2F6A52' },
  { key: 'ocean', name: 'Biru samudra', color: '#1F3F5C', dark: '#2F5F86' },
  { key: 'plum', name: 'Plum', color: '#4A2F48', dark: '#6A4866' },
  { key: 'clay', name: 'Terakota', color: '#8A4428', dark: '#A45A3B' },
  { key: 'graphite', name: 'Grafit', color: '#1C1C1B', dark: '#E6E6E3' },
];

const ACCENT_KEYS = ACCENTS.map((a) => a.key) as string[];

export type { WeekStart };

export interface PrefsState {
  theme: ThemeMode;
  accent: Accent;
  sidebarCollapsed: boolean;
  density: 'comfortable' | 'compact';
  reduceMotion: boolean;
  hideAmounts: boolean;
  /** Tata letak dasbor yang dapat disesuaikan */
  dashboard: DashLayout;
  /** Favorit, menu tersembunyi, urutan & kelompok terlipat di sidebar */
  nav: NavPrefs;
  /** Sederhana menyembunyikan halaman pembukuan teknis */
  mode: UiMode;
  weekStart: WeekStart;
  /** Halaman yang dibuka pertama kali */
  landing: string;
  /** Periode bawaan halaman Laporan */
  reportPreset: PresetKey;
  /** Angka ringkas (rb/jt) di kartu & daftar yang sempit */
  compactNumbers: boolean;
  /** Kartu "Mulai di sini" sudah ditutup */
  onboardingDismissed: boolean;
}

interface Prefs extends PrefsState {
  set: (p: Partial<PrefsState>) => void;
  setLayout: (fn: (l: DashLayout) => DashLayout) => void;
  setNav: (fn: (n: NavPrefs) => NavPrefs) => void;
}

/** Kunci preferensi yang ikut disimpan di berkas cadangan */
export const BACKUP_PREF_KEYS: (keyof PrefsState)[] = [
  'theme', 'accent', 'density', 'reduceMotion', 'dashboard', 'nav', 'mode', 'weekStart', 'landing', 'reportPreset', 'compactNumbers',
];

const LANDINGS = ['/', '/transaksi', '/dompet', '/anggaran', '/hutang-piutang', '/laporan'];
const REPORT_PRESETS: PresetKey[] = ['this_month', 'last_month', 'this_quarter', 'ytd', 'this_year', 'last_year', 'fiscal_year', 'last_30', 'last_90'];

/** Menyelaraskan preferensi dari penyimpanan lama / berkas cadangan dengan bentuk terkini. */
export function sanitizePrefs(raw: Record<string, unknown>): Partial<PrefsState> {
  const p: Partial<PrefsState> = {};
  if (raw.theme === 'light' || raw.theme === 'dark' || raw.theme === 'system') p.theme = raw.theme;
  if (ACCENT_KEYS.includes(String(raw.accent))) p.accent = raw.accent as Accent;
  if (typeof raw.sidebarCollapsed === 'boolean') p.sidebarCollapsed = raw.sidebarCollapsed;
  if (raw.density === 'comfortable' || raw.density === 'compact') p.density = raw.density;
  if (typeof raw.reduceMotion === 'boolean') p.reduceMotion = raw.reduceMotion;
  if (typeof raw.hideAmounts === 'boolean') p.hideAmounts = raw.hideAmounts;
  if (raw.dashboard !== undefined) p.dashboard = sanitizeLayout(raw.dashboard);
  if (raw.nav !== undefined) p.nav = sanitizeNavPrefs(raw.nav);
  if (raw.mode === 'simple' || raw.mode === 'accountant') p.mode = raw.mode;
  if (raw.weekStart === 0 || raw.weekStart === 1) p.weekStart = raw.weekStart;
  // Kalender kini tab di Transaksi: halaman pembuka lama '/kalender' dialihkan.
  const landing = raw.landing === '/kalender' ? '/transaksi' : raw.landing;
  if (typeof landing === 'string' && LANDINGS.includes(landing)) p.landing = landing;
  if (REPORT_PRESETS.includes(raw.reportPreset as PresetKey)) p.reportPreset = raw.reportPreset as PresetKey;
  if (typeof raw.compactNumbers === 'boolean') p.compactNumbers = raw.compactNumbers;
  if (typeof raw.onboardingDismissed === 'boolean') p.onboardingDismissed = raw.onboardingDismissed;
  return p;
}

export const LANDING_OPTIONS = LANDINGS;
export const REPORT_PRESET_OPTIONS = REPORT_PRESETS;

export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      theme: 'system',
      accent: 'forest',
      sidebarCollapsed: false,
      density: 'comfortable',
      reduceMotion: false,
      hideAmounts: false,
      dashboard: defaultLayout(),
      nav: defaultNavPrefs(),
      // Pengguna baru mulai dari Mode Sederhana (keuangan pribadi); pembukuan teknis tinggal dinyalakan di Tampilan.
      mode: 'simple',
      weekStart: 1,
      landing: '/',
      reportPreset: 'ytd',
      compactNumbers: true,
      onboardingDismissed: false,
      set: (p) => set(p),
      setLayout: (fn) => set((s) => ({ dashboard: fn(s.dashboard) })),
      setNav: (fn) => set((s) => ({ nav: fn(s.nav) })),
    }),
    {
      // Nama kunci lama dipertahankan agar preferensi pengguna tidak hilang.
      name: 'neraca.prefs',
      version: 3,
      storage: createJSONStorage(() => {
        try {
          return localStorage;
        } catch {
          return sessionStorage;
        }
      }),
      migrate: (persisted) => {
        const p = { ...(persisted as Record<string, unknown>) };
        // Tampilan baru: warna aksen lama diganti hijau hutan.
        if (!ACCENT_KEYS.includes(String(p.accent))) p.accent = 'forest';
        return sanitizePrefs(p) as unknown as Prefs;
      },
      // Data tersimpan selalu dibersihkan sebelum digabung dengan nilai bawaan.
      merge: (persisted, current) => ({ ...current, ...sanitizePrefs((persisted ?? {}) as Record<string, unknown>) }),
      partialize: ({ set: _s, setLayout: _l, setNav: _n, ...rest }) => {
        void _s;
        void _l;
        void _n;
        return rest as Prefs;
      },
    },
  ),
);

/* ───────── Ephemeral UI state ───────── */

export interface TxModalState {
  open: boolean;
  editing?: Transaction;
  defaults?: Partial<Transaction> & { type?: TxType };
}

interface UIState {
  tx: TxModalState;
  palette: boolean;
  shortcuts: boolean;
  mobileNav: boolean;
  openTx: (defaults?: TxModalState['defaults']) => void;
  editTx: (t: Transaction) => void;
  closeTx: () => void;
  setPalette: (v: boolean) => void;
  setShortcuts: (v: boolean) => void;
  setMobileNav: (v: boolean) => void;
}

export const useUI = create<UIState>()((set) => ({
  tx: { open: false },
  palette: false,
  shortcuts: false,
  mobileNav: false,
  // Membuka formulir dari laci ponsel juga menutup lacinya.
  openTx: (defaults) => set({ tx: { open: true, defaults }, palette: false, mobileNav: false }),
  editTx: (t) => set({ tx: { open: true, editing: t }, palette: false }),
  closeTx: () => set((s) => ({ tx: { ...s.tx, open: false } })),
  setPalette: (v) => set(v ? { palette: true, mobileNav: false } : { palette: false }),
  setShortcuts: (v) => set({ shortcuts: v }),
  setMobileNav: (v) => set({ mobileNav: v }),
}));

/* ───────── Toasts ───────── */

export interface Toast {
  id: string;
  message: string;
  detail?: string;
  tone?: 'default' | 'success' | 'danger' | 'info';
  action?: { label: string; run: () => void };
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => string;
  dismiss: (id: string) => void;
}

export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  push: (t) => {
    const id = uid('t');
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = (message: string, opts: Omit<Toast, 'id' | 'message'> = {}) =>
  useToasts.getState().push({ message, ...opts });

/* ───────── Confirm dialog ───────── */

export interface ConfirmOpts {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
}

interface ConfirmState {
  current: (ConfirmOpts & { resolve: (v: boolean) => void }) | null;
  ask: (o: ConfirmOpts) => Promise<boolean>;
  close: (v: boolean) => void;
}

export const useConfirm = create<ConfirmState>()((set, get) => ({
  current: null,
  ask: (o) =>
    new Promise<boolean>((resolve) => {
      get().current?.resolve(false);
      set({ current: { ...o, resolve } });
    }),
  close: (v) => {
    const c = get().current;
    if (c) c.resolve(v);
    set({ current: null });
  },
}));

export const confirm = (o: ConfirmOpts) => useConfirm.getState().ask(o);
