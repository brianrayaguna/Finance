import { useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Search } from '../../lib/glyphs';
import { ICON_GROUPS, ICONS, PALETTE } from '../../lib/icons';
import { normalize } from '../../lib/format';

const ICON_LABELS: Record<string, string> = {
  wallet: 'Dompet', landmark: 'Bank', smartphone: 'Dompet digital', 'credit-card': 'Kartu kredit',
  'piggy-bank': 'Tabungan', 'hand-coins': 'Piutang', banknote: 'Uang tunai', coins: 'Koin',
  vault: 'Brankas', 'wallet-cards': 'Kartu & dompet', 'trending-up': 'Naik', 'trending-down': 'Turun',
  'chart-line': 'Investasi', bitcoin: 'Aset kripto', 'circle-dollar': 'Dolar', 'badge-percent': 'Diskon',
  percent: 'Persen', briefcase: 'Pekerjaan', gift: 'Hadiah', trophy: 'Penghargaan',
  handshake: 'Hutang', 'heart-handshake': 'Donasi', receipt: 'Struk', 'receipt-text': 'Tagihan',
  scale: 'Neraca', calculator: 'Kalkulator', spreadsheet: 'Laporan',
  utensils: 'Makan', 'utensils-crossed': 'Restoran', coffee: 'Kopi', pizza: 'Piza', beer: 'Minuman',
  wine: 'Minuman botol', cake: 'Kue', salad: 'Salad', soup: 'Sup', sandwich: 'Roti lapis',
  'ice-cream': 'Es krim', 'cup-soda': 'Minuman dingin', croissant: 'Roti', apple: 'Buah',
  carrot: 'Sayur', drumstick: 'Lauk',
  'shopping-cart': 'Keranjang belanja', 'shopping-bag': 'Tas belanja', store: 'Toko', package: 'Paket',
  shirt: 'Pakaian', gem: 'Perhiasan', glasses: 'Kacamata', watch: 'Jam tangan', scissors: 'Perawatan',
  tag: 'Label',
  car: 'Mobil', motorbike: 'Motor', bus: 'Bus', fuel: 'Bahan bakar', train: 'Kereta', tram: 'Trem',
  bike: 'Sepeda', plane: 'Pesawat', ship: 'Kapal', truck: 'Pengiriman', luggage: 'Perjalanan',
  'map-pin': 'Lokasi',
  house: 'Rumah', building: 'Gedung', sofa: 'Perabot', bed: 'Kamar tidur', bath: 'Kamar mandi',
  plug: 'Colokan', zap: 'Listrik', droplets: 'Air', wifi: 'Internet', router: 'Router', phone: 'Telepon',
  tv: 'Televisi', hammer: 'Perbaikan', wrench: 'Servis', paintbrush: 'Dekorasi',
  'washing-machine': 'Mesin cuci', refrigerator: 'Kulkas', key: 'Kunci',
  'heart-pulse': 'Kesehatan', pill: 'Obat', stethoscope: 'Dokter', hospital: 'Rumah sakit',
  syringe: 'Medis', dumbbell: 'Olahraga', footprints: 'Lari', heart: 'Kebugaran',
  'graduation-cap': 'Pendidikan', 'book-open': 'Buku', school: 'Sekolah', library: 'Perpustakaan',
  pen: 'Alat tulis', laptop: 'Laptop', monitor: 'Komputer', code: 'Pemrograman', cpu: 'Perangkat keras',
  headphones: 'Audio', camera: 'Kamera', newspaper: 'Berita', lightbulb: 'Ide', rocket: 'Usaha rintisan',
  factory: 'Industri', cloud: 'Layanan awan', server: 'Peladen',
  gamepad: 'Permainan', film: 'Film', music: 'Musik', popcorn: 'Bioskop', ticket: 'Tiket',
  'tree-palm': 'Liburan', mountain: 'Alam', tent: 'Berkemah', 'party-popper': 'Perayaan',
  guitar: 'Alat musik', dices: 'Hiburan', star: 'Favorit', crown: 'Utama', medal: 'Prestasi',
  baby: 'Anak', 'toy-brick': 'Mainan', users: 'Keluarga', dog: 'Anjing', cat: 'Kucing',
  'paw-print': 'Hewan peliharaan', church: 'Ibadah', 'hand-helping': 'Sosial', flower: 'Bunga',
  leaf: 'Tanaman', sprout: 'Tumbuh', mail: 'Surat', globe: 'Internasional',
  shield: 'Asuransi', umbrella: 'Perlindungan', gov: 'Pajak & pemerintah', folder: 'Berkas',
  archive: 'Arsip', boxes: 'Perlengkapan', lock: 'Keamanan', flame: 'Darurat', hourglass: 'Waktu',
  repeat: 'Berulang', cigarette: 'Rokok',
};

const iconLabel = (k: string) => ICON_LABELS[k] ?? k.replace(/-/g, ' ');

const ICON_ALIASES: Record<string, string> = {
  wallet: 'dompet uang', landmark: 'bank', smartphone: 'hp ponsel dompet digital', 'credit-card': 'kartu kredit',
  'piggy-bank': 'tabungan celengan', utensils: 'makan', coffee: 'kopi', 'shopping-cart': 'belanja',
  car: 'mobil', motorbike: 'motor', house: 'rumah', zap: 'listrik', wifi: 'internet', 'heart-pulse': 'kesehatan',
  'graduation-cap': 'sekolah pendidikan', gift: 'hadiah', briefcase: 'gaji kerja', plane: 'liburan pesawat',
  baby: 'anak bayi', shield: 'asuransi', gov: 'pajak pemerintah', fuel: 'bensin', film: 'film hiburan',
  'party-popper': 'pesta perayaan',
};

function handleRadioKey<T>(e: KeyboardEvent<HTMLButtonElement>, items: readonly T[], idx: number, onPick: (item: T) => void, grid = false) {
  let next: number | null = null;
  const cols = grid && e.currentTarget.parentElement ? Math.max(1, getComputedStyle(e.currentTarget.parentElement).gridTemplateColumns.split(' ').filter(Boolean).length) : 1;
  if (e.key === 'ArrowRight' || (!grid && e.key === 'ArrowDown')) next = (idx + 1) % items.length;
  else if (e.key === 'ArrowLeft' || (!grid && e.key === 'ArrowUp')) next = (idx - 1 + items.length) % items.length;
  else if (grid && e.key === 'ArrowDown') next = Math.min(items.length - 1, idx + cols);
  else if (grid && e.key === 'ArrowUp') next = Math.max(0, idx - cols);
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = items.length - 1;
  if (next === null || !items.length) return;
  e.preventDefault();
  onPick(items[next]);
  const radios = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
  radios?.[next]?.focus();
}

export function IconPicker({ value, onChange, color }: { value: string; onChange: (v: string) => void; color?: string }) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    if (!q.trim()) return ICON_GROUPS;
    const n = normalize(q);
    const hits = Object.keys(ICONS).filter(
      (k) => k !== 'party' && normalize(`${k} ${iconLabel(k)} ${ICON_ALIASES[k] ?? ''}`).includes(n),
    );
    return [{ label: 'Hasil', icons: hits }];
  }, [q]);
  return (
    <div className="icon-picker">
      <div className="input input-sunken" style={{ marginBottom: 10 }}>
        <Search aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari ikon…" aria-label="Cari ikon" />
      </div>
      <div className="icon-picker-scroll">
        {groups.map((g) => {
          const validIcons = g.icons.filter((k) => !!ICONS[k]);
          const activeIdx = validIcons.indexOf(value);
          return (
            <div key={g.label} style={{ marginBottom: 10 }}>
              <div className="label-caps" style={{ margin: '2px 2px 6px' }}>
                {g.label}
              </div>
              <div className="icon-grid" role="radiogroup" aria-label={g.label}>
                {validIcons.map((k, idx) => {
                  const I = ICONS[k];
                  const sel = value === k;
                  const tab = activeIdx >= 0 ? (idx === activeIdx ? 0 : -1) : idx === 0 ? 0 : -1;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={sel}
                      tabIndex={tab}
                      aria-label={iconLabel(k)}
                      title={iconLabel(k)}
                      className="icon-cell"
                      style={
                        sel && color
                          ? ({ background: color, color: '#fff', boxShadow: `0 3px 10px -3px ${color}` } as CSSProperties)
                          : undefined
                      }
                      onClick={() => onChange(k)}
                      onKeyDown={(e) => handleRadioKey(e, validIcons, idx, onChange, true)}
                    >
                      <I />
                    </button>
                  );
                })}
              </div>
              {!validIcons.length && <div className="list-empty">Ikon tidak ditemukan</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const activeIdx = PALETTE.findIndex((p) => p.value.toLowerCase() === value.toLowerCase());
  return (
    <div className="swatches" role="radiogroup" aria-label="Pilih warna">
      {PALETTE.map((p, idx) => {
        const checked = idx === activeIdx;
        const tab = activeIdx >= 0 ? (checked ? 0 : -1) : idx === 0 ? 0 : -1;
        return (
          <button
            key={p.key}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={tab}
            aria-label={p.name}
            title={p.name}
            className="swatch"
            style={{ '--c': p.value } as CSSProperties}
            onClick={() => onChange(p.value)}
            onKeyDown={(e) => handleRadioKey(e, PALETTE, idx, (picked) => onChange(picked.value))}
          />
        );
      })}
    </div>
  );
}
