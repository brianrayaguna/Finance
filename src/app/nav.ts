import {
  LayoutDashboard,
  ArrowLeftRight,
  CalendarDays,
  Wallet,
  HandCoins,
  Gauge,
  Building2,
  NotebookPen,
  BookOpenText,
  Scale,
  ListTree,
  FileChartColumn,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  hotkey?: string;
  /** Deskripsi singkat — dipakai di palet perintah */
  desc?: string;
}

export interface NavSection {
  id: string;
  section: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    id: 'ikhtisar',
    section: 'Ikhtisar',
    items: [
      { to: '/', label: 'Ringkasan', icon: LayoutDashboard, hotkey: '1', desc: 'Posisi & arus keuangan' },
      { to: '/transaksi', label: 'Transaksi', icon: ArrowLeftRight, hotkey: '2', desc: 'Daftar mutasi harian' },
    ],
  },
  {
    id: 'keuangan',
    section: 'Keuangan',
    items: [
      { to: '/dompet', label: 'Dompet & Rekening', icon: Wallet, hotkey: '4', desc: 'Saldo kas, bank, e-wallet' },
      { to: '/anggaran', label: 'Anggaran', icon: Gauge, hotkey: '5', desc: 'Batas beban bulanan' },
      { to: '/hutang-piutang', label: 'Hutang & Piutang', icon: HandCoins, hotkey: '6', desc: 'Jadwal & jatuh tempo' },
      { to: '/aset', label: 'Aset Tetap', icon: Building2, desc: 'Register & penyusutan' },
    ],
  },
  {
    id: 'pembukuan',
    section: 'Pembukuan',
    items: [
      { to: '/jurnal', label: 'Jurnal Umum', icon: NotebookPen, hotkey: '7', desc: 'Jurnal berpasangan' },
      { to: '/buku-besar', label: 'Buku Besar', icon: BookOpenText, hotkey: '8', desc: 'Mutasi per akun' },
      { to: '/neraca-saldo', label: 'Neraca Saldo', icon: Scale, desc: 'Uji keseimbangan akun' },
      { to: '/akun', label: 'Bagan Akun & Kategori', icon: ListTree, desc: 'Struktur akun & kategori' },
    ],
  },
  {
    id: 'pelaporan',
    section: 'Pelaporan',
    items: [{ to: '/laporan', label: 'Laporan Keuangan', icon: FileChartColumn, hotkey: '9', desc: 'Laba rugi, neraca, arus kas' }],
  },
];

/** Warna penanda tiap kelompok menu: ikon berada di ubin berwarna lembut agar menu mudah dibedakan sekilas. */
const SECTION_TONE: Record<string, string> = {
  ikhtisar: 'var(--accent-ink)',
  keuangan: 'var(--sys-teal)',
  pembukuan: 'var(--sys-indigo)',
  pelaporan: 'var(--sys-orange)',
};

export function toneOf(to: string): string | undefined {
  const sec = NAV.find((s) => s.items.some((i) => i.to === to));
  return sec ? SECTION_TONE[sec.id] : undefined;
}

/** Item yang disematkan di bagian bawah sidebar */
export const NAV_FOOT: NavItem[] = [{ to: '/pengaturan', label: 'Pengaturan', icon: Settings, hotkey: '0', desc: 'Profil, tampilan, data' }];

/** Tujuan yang tidak punya menu sendiri (tab di dalam halaman lain) tetapi tetap dicari di palet & pintasan Alt+angka */
export const NAV_ALIASES: NavItem[] = [{ to: '/transaksi?tampil=kalender', label: 'Kalender', icon: CalendarDays, hotkey: '3', desc: 'Aktivitas per tanggal' }];

export const ALL_NAV = [...NAV.flatMap((s) => s.items), ...NAV_FOOT, ...NAV_ALIASES];

/* ───────── Personalisasi navigasi ───────── */

export type UiMode = 'simple' | 'accountant';

export interface NavPrefs {
  /** Rute yang disembunyikan dari sidebar (tetap bisa dibuka lewat pencarian) */
  hidden: string[];
  /** Halaman favorit, sesuai urutan tampil */
  pinned: string[];
  /** Urutan kustom per kelompok (id kelompok → daftar rute) */
  order: Record<string, string[]>;
  /** Kelompok yang sedang dilipat */
  folded: string[];
}

// Daftar saldo rekening di sidebar dilipat sejak awal (rinciannya ada di Dompet) agar sidebar tidak ikut bergulir.
export const defaultNavPrefs = (): NavPrefs => ({ hidden: [], pinned: [], order: {}, folded: ['rekening'] });

/** Halaman pembukuan teknis yang disembunyikan pada Mode Sederhana */
export const SIMPLE_HIDDEN = ['/jurnal', '/buku-besar', '/neraca-saldo'];

/** Kelompok sidebar di luar NAV yang juga dapat dilipat */
export const SIDEBAR_GROUPS = ['favorit', 'rekening'];

const NAV_ROUTES = new Set(NAV.flatMap((s) => s.items.map((i) => i.to)));

export function sanitizeNavPrefs(raw: unknown): NavPrefs {
  const d = defaultNavPrefs();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<NavPrefs>;
  const routes = (x: unknown) => (Array.isArray(x) ? [...new Set(x.filter((v): v is string => typeof v === 'string' && NAV_ROUTES.has(v)))] : []);
  const order: Record<string, string[]> = {};
  if (r.order && typeof r.order === 'object')
    for (const sec of NAV) {
      const o = (r.order as Record<string, unknown>)[sec.id];
      const own = new Set(sec.items.map((i) => i.to));
      if (Array.isArray(o)) order[sec.id] = routes(o).filter((x) => own.has(x));
    }
  // 'favorit' & 'rekening' = kelompok khusus sidebar (bukan bagian dari NAV)
  const folded = Array.isArray(r.folded)
    ? [...new Set(r.folded.filter((x): x is string => SIDEBAR_GROUPS.includes(x) || NAV.some((s) => s.id === x)))]
    : [];
  return { hidden: routes(r.hidden), pinned: routes(r.pinned), order, folded };
}

/** Urutan item sebuah kelompok setelah penyesuaian pengguna. */
export function orderedItems(sec: NavSection, prefs: NavPrefs): NavItem[] {
  const o = prefs.order[sec.id] ?? [];
  const rank = (to: string) => {
    const i = o.indexOf(to);
    return i < 0 ? o.length + sec.items.findIndex((x) => x.to === to) : i;
  };
  return [...sec.items].sort((a, b) => rank(a.to) - rank(b.to));
}

/** Model sidebar: favorit + kelompok, dengan item tersembunyi/mode sederhana sudah disaring. */
export function buildNav(prefs: NavPrefs, mode: UiMode) {
  const hidden = new Set([...prefs.hidden, ...(mode === 'simple' ? SIMPLE_HIDDEN : [])]);
  const pinned = prefs.pinned.filter((to) => !hidden.has(to));
  const pinnedSet = new Set(pinned);
  const byRoute = new Map(NAV.flatMap((s) => s.items.map((i) => [i.to, i] as const)));
  return {
    favorites: pinned.map((to) => byRoute.get(to)).filter((x): x is NavItem => !!x),
    sections: NAV.map((sec) => ({
      ...sec,
      items: orderedItems(sec, prefs).filter((i) => !hidden.has(i.to) && !pinnedSet.has(i.to)),
    })).filter((sec) => sec.items.length > 0),
  };
}

function find(pathname: string): NavItem | undefined {
  const exact = ALL_NAV.find((n) => n.to === pathname);
  if (exact) return exact;
  return ALL_NAV.filter((n) => n.to !== '/' && pathname.startsWith(n.to)).sort((a, b) => b.to.length - a.to.length)[0];
}

export function navLabel(pathname: string): string {
  return find(pathname)?.label ?? 'Keuanganku';
}

/** Nama kelompok navigasi untuk halaman aktif (mis. "Keuangan") */
export function navSection(pathname: string): string {
  const it = find(pathname);
  if (!it) return '';
  if (NAV_FOOT.includes(it)) return 'Sistem';
  return NAV.find((s) => s.items.includes(it))?.section ?? '';
}
