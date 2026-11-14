import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Download,
  Upload,
  FlaskConical,
  RotateCcw,
  Keyboard,
  User,
  Palette,
  Database,
  Check,
  HardDrive,
  Info,
  ShieldCheck,
  ShieldAlert,
  SlidersHorizontal,
  ListTree,
  Star,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Lock,
  type Glyph,
} from '../lib/glyphs';
import { checkIntegrity } from '../accounting/integrity';
import type { AppData } from '../accounting/types';
import { useData, updateProfile, replaceData, isValidData, resetAll, getData, normalizeData } from '../store/data';
import { buildSampleData } from '../store/sample';
import {
  usePrefs,
  useUI,
  confirm,
  toast,
  ACCENTS,
  BACKUP_PREF_KEYS,
  LANDING_OPTIONS,
  REPORT_PRESET_OPTIONS,
  sanitizePrefs,
  type PrefsState,
  type ThemeMode,
} from '../store/ui';
import { NAV, SIMPLE_HIDDEN, defaultNavPrefs, navLabel, orderedItems, type NavSection } from '../app/nav';
import { APP_VERSION, downloadBackup } from '../app/backup';
import { describePeriod } from '../components/ui/PeriodPicker';
import { DatePicker } from '../components/ui/DatePicker';
import { Tooltip } from '../components/ui/Tooltip';
import { notify } from '../store/history';
import { MONTHS, addMonths, endOfMonth, formatDate, isoFromTs, startOfMonth, todayISO } from '../lib/format';
import { PageHeader } from '../components/layout/Topbar';
import { Button, Field, Switch, TextInput } from '../components/ui/primitives';
import { Select } from '../components/ui/Select';
import { Segmented } from '../components/ui/Segmented';
import { LogoMark } from '../components/brand/Logo';
import { useIsDark } from '../hooks/useApp';
import { modKey } from '../lib/layers';

const SECTIONS: { id: string; label: string; icon: Glyph }[] = [
  { id: 'profil', label: 'Profil & buku', icon: User },
  { id: 'tampilan', label: 'Tampilan & mode', icon: Palette },
  { id: 'preferensi', label: 'Preferensi', icon: SlidersHorizontal },
  { id: 'navigasi', label: 'Menu & navigasi', icon: ListTree },
  { id: 'data', label: 'Data & cadangan', icon: Database },
  { id: 'tentang', label: 'Tentang', icon: Info },
];

/** Atur menu sidebar: sematkan ke Favorit, sembunyikan, dan ubah urutan per kelompok. */
function NavSettings() {
  const nav = usePrefs((s) => s.nav);
  const mode = usePrefs((s) => s.mode);
  const setNav = usePrefs((s) => s.setNav);
  const hidden = new Set(nav.hidden);
  const pinned = new Set(nav.pinned);
  const toggle = (key: 'hidden' | 'pinned', to: string) =>
    setNav((n) => ({ ...n, [key]: n[key].includes(to) ? n[key].filter((x) => x !== to) : [...n[key], to] }));
  const move = (sec: NavSection, to: string, dir: -1 | 1) =>
    setNav((n) => {
      const list = orderedItems(sec, n).map((i) => i.to);
      const i = list.indexOf(to);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return n;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...n, order: { ...n.order, [sec.id]: list } };
    });
  const custom = nav.hidden.length > 0 || nav.pinned.length > 0 || Object.keys(nav.order).length > 0;
  return (
    <div className="navset">
      {NAV.map((sec) => {
        const items = orderedItems(sec, nav);
        return (
          <div key={sec.id} className="navset-group" role="group" aria-label={sec.section}>
            <div className="label-caps">{sec.section}</div>
            {items.map((it, i) => {
              const isHidden = hidden.has(it.to);
              const bySimple = mode === 'simple' && SIMPLE_HIDDEN.includes(it.to);
              const isPinned = pinned.has(it.to);
              return (
                <div key={it.to} className={`navset-row${isHidden || bySimple ? ' off' : ''}`}>
                  <it.icon className="navset-ico" aria-hidden />
                  <span className="grow navset-label">
                    {it.label}
                    {bySimple && <span className="navset-note">disembunyikan mode Sederhana</span>}
                  </span>
                  <Tooltip label={isPinned ? 'Lepas dari Favorit' : 'Sematkan ke Favorit'}>
                    <button type="button" className={`navset-btn star${isPinned ? ' on' : ''}`} aria-pressed={isPinned} aria-label={`Favorit: ${it.label}`} onClick={() => toggle('pinned', it.to)}>
                      <Star solid={isPinned} aria-hidden />
                    </button>
                  </Tooltip>
                  <Tooltip label={it.to === '/' ? 'Ringkasan selalu tampil' : isHidden ? 'Tampilkan di sidebar' : 'Sembunyikan dari sidebar'}>
                    <button
                      type="button"
                      className="navset-btn"
                      aria-pressed={!isHidden}
                      aria-label={`Tampilkan ${it.label} di sidebar`}
                      onClick={() => toggle('hidden', it.to)}
                      disabled={it.to === '/'}
                    >
                      {isHidden ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                    </button>
                  </Tooltip>
                  <button type="button" className="navset-btn" onClick={() => move(sec, it.to, -1)} disabled={i === 0} aria-label={`Naikkan ${it.label}`}>
                    <ArrowUp aria-hidden />
                  </button>
                  <button type="button" className="navset-btn" onClick={() => move(sec, it.to, 1)} disabled={i === items.length - 1} aria-label={`Turunkan ${it.label}`}>
                    <ArrowDown aria-hidden />
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
      <div className="navset-foot">
        <span className="muted">Menu yang disembunyikan tetap bisa dibuka lewat pencarian ({modKey('K')}).</span>
        <Button size="sm" variant="ghost" icon={RotateCcw} disabled={!custom} onClick={() => setNav((n) => ({ ...defaultNavPrefs(), folded: n.folded }))}>
          Kembalikan bawaan
        </Button>
      </div>
    </div>
  );
}

function ThemeTile({ mode, active, onClick }: { mode: ThemeMode; active: boolean; onClick: () => void }) {
  const label = mode === 'light' ? 'Terang' : mode === 'dark' ? 'Gelap' : 'Ikuti sistem';
  return (
    <button type="button" className={`theme-tile${active ? ' active' : ''}`} onClick={onClick} aria-pressed={active}>
      <span className={`tt-preview ${mode}`}>
        <span className="tt-side" />
        <span className="tt-main">
          <span className="tt-bar" />
          <span className="tt-card" />
          <span className="tt-card sm" />
        </span>
      </span>
      <span className="tt-label">
        {active && <Check size={13} />}
        {label}
      </span>
    </button>
  );
}

function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="set-row">
      <div className="grow">
        <div className="set-title">{title}</div>
        {desc && <div className="set-desc">{desc}</div>}
      </div>
      <div className="set-ctl">{children}</div>
    </div>
  );
}

function SectionHead({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="set-head">
      <div>
        <h3>{title}</h3>
        <p>{desc}</p>
      </div>
    </div>
  );
}

function IntegrityPanel({ data }: { data: AppData }) {
  const issues = useMemo(() => checkIntegrity(data), [data]);
  const editTx = useUI((s) => s.editTx);
  const [open, setOpen] = useState(false);
  const errors = issues.filter((i) => i.level === 'error').length;
  const warns = issues.length - errors;
  const tone = errors ? 'bad' : warns ? 'warn' : 'ok';
  return (
    <div className={`integrity ${tone}`} id="integritas">
      <div className="integrity-head">
        {tone === 'ok' ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
        <span className="grow">
          <strong>Integritas buku</strong>
          <span className="integrity-sum">
            {issues.length === 0
              ? 'Semua transaksi terjurnal, debit = kredit, dan tidak ada data yatim.'
              : [errors && `${errors} masalah`, warns && `${warns} peringatan`].filter(Boolean).join(' · ')}
          </span>
        </span>
        {issues.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? 'Sembunyikan' : 'Lihat rincian'}
          </Button>
        )}
      </div>
      {open && issues.length > 0 && (
        <ul className="integrity-list">
          {issues.map((i, k) => (
            <li key={k} className={i.level}>
              <span className="grow">{i.message}</span>
              {i.txId && (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    const t = data.transactions.find((x) => x.id === i.txId);
                    if (t) editTx(t);
                  }}
                >
                  Perbaiki
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Settings() {
  const profile = useData((s) => s.data.profile);
  const data = useData((s) => s.data);
  const prefs = usePrefs();
  const setShortcuts = useUI((s) => s.setShortcuts);
  const isDark = useIsDark();
  const [name, setName] = useState(profile.name);
  const [entity, setEntity] = useState(profile.entityName);
  const [active, setActive] = useState(SECTIONS[0].id);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sinkronkan isian bila profil berubah dari luar (simpan, urungkan, pulihkan cadangan).
  useEffect(() => {
    setName(profile.name);
    setEntity(profile.entityName);
  }, [profile.name, profile.entityName]);

  const size = useMemo(() => new Blob([JSON.stringify(data)]).size, [data]);
  const dirty = name !== profile.name || entity !== profile.entityName;

  // Menandai bagian yang sedang terlihat pada navigasi samping
  useEffect(() => {
    const onScroll = () => {
      const offset = 200;
      let cur = SECTIONS[0].id;
      for (const s of SECTIONS) {
        const el = document.getElementById(`set-${s.id}`);
        if (el && el.getBoundingClientRect().top - offset <= 0) cur = s.id;
      }
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) cur = SECTIONS[SECTIONS.length - 1].id;
      setActive(cur);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const jump = (id: string) => {
    setActive(id);
    document.getElementById(`set-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const saveProfile = () => {
    notify('Profil disimpan', updateProfile({ name: name.trim(), entityName: entity.trim() }));
  };

  /** Kunci periode: mengunci butuh konfirmasi yang menyebut dampaknya; membuka kunci juga dikonfirmasi. */
  const setLock = async (date: string) => {
    const cur = profile.lockDate ?? '';
    if (date === cur) return;
    if (!date) {
      const ok = await confirm({
        title: 'Buka kunci periode?',
        message: `Transaksi sampai ${formatDate(cur, 'long')} akan bisa diubah dan dihapus lagi. Laporan periode itu dapat berubah.`,
        confirmLabel: 'Buka kunci',
        tone: 'danger',
      });
      if (ok) notify('Kunci periode dibuka', updateProfile({ lockDate: undefined }, 'Buka kunci periode'));
      return;
    }
    const n = getData().transactions.filter((t) => t.date <= date).length;
    const ok = await confirm({
      title: `Kunci buku sampai ${formatDate(date, 'long')}?`,
      message: `${n.toLocaleString('id-ID')} transaksi pada atau sebelum tanggal ini tidak dapat ditambah, diubah, atau dihapus sampai kunci dibuka. Laporan periode itu tidak akan berubah lagi.`,
      confirmLabel: 'Kunci periode',
    });
    if (ok) notify(`Buku dikunci sampai ${formatDate(date, 'long')}`, updateProfile({ lockDate: date }, 'Kunci periode'));
  };

  const restore = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const d = parsed?.data ?? parsed;
      if (!isValidData(d)) throw new Error('invalid');
      const rawPrefs = parsed?.prefs && typeof parsed.prefs === 'object' ? sanitizePrefs(parsed.prefs) : null;
      const restoredPrefs: Partial<PrefsState> = {};
      if (rawPrefs) for (const k of BACKUP_PREF_KEYS) if (rawPrefs[k] !== undefined) Object.assign(restoredPrefs, { [k]: rawPrefs[k] });
      const withPrefs = Object.keys(restoredPrefs).length > 0;
      const ok = await confirm({
        title: 'Pulihkan dari cadangan?',
        message: `${d.transactions.length} transaksi dan ${d.accounts.length} akun akan menggantikan data saat ini${
          withPrefs ? ', beserta tata letak dasbor, menu, dan preferensi tampilan' : ''
        }. Data dapat diurungkan.`,
        confirmLabel: 'Pulihkan',
      });
      if (!ok) return;
      notify('Data dipulihkan dari cadangan', replaceData(normalizeData(d), 'Pulihkan cadangan'));
      if (withPrefs) usePrefs.getState().set(restoredPrefs);
    } catch {
      toast('Berkas cadangan tidak valid', { tone: 'danger' });
    }
  };

  const loadSample = async () => {
    const ok = await confirm({
      title: 'Muat data contoh?',
      message: 'Data saat ini akan diganti dengan delapan bulan transaksi contoh. Tindakan ini dapat diurungkan.',
      confirmLabel: 'Muat contoh',
    });
    if (ok) notify('Data contoh dimuat', replaceData(buildSampleData({ ...profile, onboarded: true }), 'Muat data contoh'));
  };

  const reset = async () => {
    const ok = await confirm({
      title: 'Atur ulang semua data?',
      message: 'Semua transaksi, akun buatan, anggaran, dan aset akan dihapus. Unduh cadangan terlebih dahulu bila perlu.',
      confirmLabel: 'Atur ulang',
      tone: 'danger',
    });
    if (ok) {
      resetAll();
      toast('Data diatur ulang');
    }
  };

  return (
    <div>
      <PageHeader title="Pengaturan" subtitle="Profil buku, tampilan, menu, dan pengelolaan data" />

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Bagian pengaturan">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" className={`sn-item${active === s.id ? ' active' : ''}`} onClick={() => jump(s.id)} aria-current={active === s.id ? 'true' : undefined}>
              {active === s.id && <motion.span layoutId="sn-pill" className="sn-pill" transition={{ type: 'spring', stiffness: 520, damping: 42 }} />}
              <s.icon />
              {s.label}
            </button>
          ))}
        </nav>

        <div className="settings-main">
          <section id="set-profil" className="card set-card">
            <SectionHead title="Profil & buku" desc="Nama tampil di bilah sisi; nama buku tampil di kop setiap laporan." />
            <div className="set-body grid-3" data-form>
              <Field label="Nama Anda">
                <TextInput value={name} onChange={setName} placeholder="mis. Brian" data-field onKeyDown={(e) => e.key === 'Enter' && dirty && saveProfile()} />
              </Field>
              <Field label="Nama buku / entitas" hint="Tampil di kop setiap laporan">
                <TextInput value={entity} onChange={setEntity} placeholder="Keuangan pribadi" data-field onKeyDown={(e) => e.key === 'Enter' && dirty && saveProfile()} />
              </Field>
              <Field label="Awal tahun buku">
                <Select
                  value={String(profile.fiscalYearStartMonth)}
                  onChange={(v) => notify(`Tahun buku dimulai ${MONTHS[Number(v) - 1]}`, updateProfile({ fiscalYearStartMonth: Number(v) }, 'Ubah tahun buku'))}
                  options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
                />
              </Field>
            </div>
            {dirty && (
              <div className="set-actions">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setName(profile.name);
                    setEntity(profile.entityName);
                  }}
                >
                  Batal
                </Button>
                <Button variant="primary" onClick={saveProfile}>
                  Simpan profil
                </Button>
              </div>
            )}
            <div className="set-body" style={{ paddingTop: 0 }}>
              <Row
                title="Kunci periode (tutup buku)"
                desc={
                  profile.lockDate
                    ? `Transaksi, saldo awal, dan aset tetap sampai ${formatDate(profile.lockDate, 'long')} terkunci — tidak dapat ditambah, diubah, atau dihapus.`
                    : 'Setelah laporan sebuah periode final, kunci periodenya agar angka tidak berubah tanpa sengaja.'
                }
              >
                <div className="lock-ctl">
                  {profile.lockDate && <Lock className="lock-ico" aria-hidden />}
                  <div style={{ width: 176 }}>
                    <DatePicker
                      ariaLabel="Tanggal kunci periode"
                      value={profile.lockDate ?? ''}
                      onChange={setLock}
                      clearable
                      compact
                      max={todayISO()}
                      placeholder="Tidak dikunci"
                      presets={[
                        { label: 'Akhir bulan lalu', date: endOfMonth(addMonths(startOfMonth(todayISO()), -1)) },
                        { label: 'Akhir tahun lalu', date: `${Number(todayISO().slice(0, 4)) - 1}-12-31` },
                      ]}
                    />
                  </div>
                </div>
              </Row>
            </div>
          </section>

          <section id="set-tampilan" className="card set-card">
            <SectionHead title="Tampilan & mode" desc="Tema, warna utama, tingkat detail pembukuan, dan kenyamanan membaca." />
            <div className="set-body">
              <div className="theme-tiles">
                {(['light', 'dark', 'system'] as ThemeMode[]).map((m) => (
                  <ThemeTile key={m} mode={m} active={prefs.theme === m} onClick={() => prefs.set({ theme: m })} />
                ))}
              </div>
              <Row
                title="Mode aplikasi"
                desc={
                  prefs.mode === 'simple'
                    ? 'Sederhana: Jurnal Umum, Buku Besar, Neraca Saldo, dan pratinjau jurnal disembunyikan. Pembukuan tetap berpasangan dan semua laporan tersedia.'
                    : 'Akuntan: seluruh halaman pembukuan (jurnal, buku besar, neraca saldo) dan pratinjau jurnal ditampilkan.'
                }
              >
                <Segmented
                  size="sm"
                  value={prefs.mode}
                  onChange={(v) => prefs.set({ mode: v })}
                  options={[
                    { value: 'simple', label: 'Sederhana' },
                    { value: 'accountant', label: 'Akuntan' },
                  ]}
                  ariaLabel="Mode aplikasi"
                />
              </Row>
              <Row title="Warna utama" desc="Dipakai pada tombol utama, menu yang sedang aktif, dan sakelar">
                <div className="swatches" role="radiogroup" aria-label="Warna utama">
                  {ACCENTS.map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      className="swatch"
                      role="radio"
                      aria-checked={prefs.accent === a.key}
                      title={a.name}
                      aria-label={a.name}
                      style={{ '--c': isDark ? a.dark : a.color } as React.CSSProperties}
                      onClick={() => prefs.set({ accent: a.key })}
                    />
                  ))}
                </div>
              </Row>
              <Row title="Kepadatan" desc="Ukuran baris dan jarak antarelemen">
                <Segmented
                  size="sm"
                  value={prefs.density}
                  onChange={(v) => prefs.set({ density: v })}
                  options={[
                    { value: 'comfortable', label: 'Lega' },
                    { value: 'compact', label: 'Ringkas' },
                  ]}
                />
              </Row>
              <Row title="Kurangi animasi" desc="Mematikan transisi dan gerakan antarmuka">
                <Switch checked={prefs.reduceMotion} onChange={(v) => prefs.set({ reduceMotion: v })} label="Kurangi animasi" />
              </Row>
              <Row title="Sembunyikan nominal" desc="Mengaburkan angka — arahkan kursor untuk melihat. Pintasan: H">
                <Switch checked={prefs.hideAmounts} onChange={(v) => prefs.set({ hideAmounts: v })} label="Sembunyikan nominal" />
              </Row>
              <Row title="Bilah sisi ringkas" desc={`Tampilkan hanya ikon navigasi. Pintasan: ${modKey('B')}`}>
                <Switch checked={prefs.sidebarCollapsed} onChange={(v) => prefs.set({ sidebarCollapsed: v })} label="Bilah sisi ringkas" />
              </Row>
              <Row title="Angka ringkas" desc="Tampilkan Rp 1,25 jt alih-alih Rp 1.250.000 pada kartu dan daftar yang sempit">
                <Switch checked={prefs.compactNumbers} onChange={(v) => prefs.set({ compactNumbers: v })} label="Angka ringkas" />
              </Row>
            </div>
          </section>

          <section id="set-preferensi" className="card set-card">
            <SectionHead title="Preferensi" desc="Kalender, halaman pembuka, dan periode bawaan laporan." />
            <div className="set-body">
              <Row title="Awal pekan" desc="Dipakai di pemilih tanggal, Kalender, dan peta pengeluaran">
                <Segmented
                  size="sm"
                  value={String(prefs.weekStart) as '0' | '1'}
                  onChange={(v) => prefs.set({ weekStart: v === '0' ? 0 : 1 })}
                  options={[
                    { value: '1', label: 'Senin' },
                    { value: '0', label: 'Minggu' },
                  ]}
                  ariaLabel="Awal pekan"
                />
              </Row>
              <Row title="Halaman pembuka" desc="Halaman yang terbuka saat aplikasi dijalankan">
                <div style={{ width: 220 }}>
                  <Select
                    compact
                    value={prefs.landing}
                    onChange={(v) => prefs.set({ landing: v })}
                    options={LANDING_OPTIONS.map((to) => ({ value: to, label: navLabel(to) }))}
                    ariaLabel="Halaman pembuka"
                  />
                </div>
              </Row>
              <Row title="Periode laporan bawaan" desc="Periode yang dipilih saat membuka Laporan Keuangan">
                <div style={{ width: 220 }}>
                  <Select
                    compact
                    value={prefs.reportPreset}
                    onChange={(v) => prefs.set({ reportPreset: v })}
                    options={REPORT_PRESET_OPTIONS.map((k) => ({ value: k, label: describePeriod({ preset: k, from: '', to: '' }) }))}
                    ariaLabel="Periode laporan bawaan"
                  />
                </div>
              </Row>
              <Row title="Pintasan keyboard" desc="Daftar lengkap kombinasi tombol">
                <Button icon={Keyboard} onClick={() => setShortcuts(true)}>
                  Lihat pintasan
                </Button>
              </Row>
            </div>
          </section>

          <section id="set-navigasi" className="card set-card">
            <SectionHead title="Menu & navigasi" desc="Sematkan halaman yang sering dibuka ke Favorit, sembunyikan yang jarang dipakai, dan atur urutannya." />
            <div className="set-body">
              <NavSettings />
            </div>
          </section>

          <section id="set-data" className="card set-card">
            <SectionHead title="Data & cadangan" desc="Data tersimpan di peramban ini. Cadangkan secara berkala." />
            <div className="set-body">
              <div className="storage-info">
                <HardDrive size={18} />
                <span className="grow">
                  <strong>{data.transactions.length.toLocaleString('id-ID')}</strong> transaksi · <strong>{data.accounts.length}</strong> akun · <strong>{data.assets.length}</strong> aset ·{' '}
                  {(size / 1024).toFixed(1).replace('.', ',')} KB
                </span>
                <span className="muted">Sejak {formatDate(isoFromTs(profile.createdAt))}</span>
              </div>
              <IntegrityPanel data={data} />
              <Row title="Cadangkan data" desc="Unduh seluruh buku sebagai berkas JSON">
                <Button icon={Download} onClick={downloadBackup}>
                  Unduh cadangan
                </Button>
              </Row>
              <Row title="Pulihkan dari cadangan" desc="Muat berkas JSON hasil cadangan sebelumnya">
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) restore(f);
                    e.target.value = '';
                  }}
                />
                <Button icon={Upload} onClick={() => fileRef.current?.click()}>
                  Pilih berkas
                </Button>
              </Row>
              <Row title="Data contoh" desc="Ganti data dengan transaksi contoh untuk menjelajah fitur">
                <Button icon={FlaskConical} onClick={loadSample}>
                  Muat contoh
                </Button>
              </Row>
              <Row title="Atur ulang" desc="Hapus seluruh data dan mulai dari awal">
                <Button variant="danger-ghost" icon={RotateCcw} onClick={reset}>
                  Atur ulang data
                </Button>
              </Row>
            </div>
          </section>

          <section id="set-tentang" className="card set-card">
            <div className="set-body" style={{ paddingTop: 20 }}>
              <div className="about">
                <LogoMark size={46} />
                <div>
                  <div className="wordmark">Keuanganku</div>
                  <p>Versi {APP_VERSION} · Pembukuan double-entry · Berjalan sepenuhnya di peramban Anda</p>
                  <p>
                    <a className="link" href="https://www.flaticon.com/uicons" target="_blank" rel="noopener noreferrer">
                      Uicons by Flaticon
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
