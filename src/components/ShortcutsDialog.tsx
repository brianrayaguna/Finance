import { Keyboard } from '../lib/glyphs';
import { useUI } from '../store/ui';
import { ALT, MOD } from '../lib/layers';
import { ALL_NAV } from '../app/nav';
import { Modal } from './ui/Modal';
import { IconTile } from './ui/primitives';

const K = ({ k }: { k: string[] }) => (
  <span className="row" style={{ gap: 3 }}>
    {k.map((x, i) => (
      <span key={i} className="kbd">
        {x}
      </span>
    ))}
  </span>
);

const GROUPS: { title: string; rows: [string, string[]][] }[] = [
  {
    title: 'Umum',
    rows: [
      ['Catat transaksi baru', ['N']],
      ['Cari & perintah', [MOD, 'K']],
      ['Urungkan', [MOD, 'Z']],
      ['Ulangi', [MOD, '⇧', 'Z']],
      ['Ciutkan / tampilkan sidebar', [MOD, 'B']],
      ['Buka pengaturan', [MOD, ',']],
      ['Sembunyikan nominal', ['H']],
      ['Pintasan keyboard', ['?']],
    ],
  },
  {
    title: 'Navigasi',
    rows: ALL_NAV.filter((n) => n.hotkey).map((n) => [n.label, [ALT, n.hotkey!]] as [string, string[]]),
  },
  {
    title: 'Formulir transaksi',
    rows: [
      ['Pindah ke field berikutnya', ['↵']],
      ['Simpan', [MOD, '↵']],
      ['Simpan & catat lagi', [MOD, '⇧', '↵']],
      ['Ganti jenis transaksi', [ALT, '1–5']],
      ['Tutup tanpa menyimpan', ['esc']],
    ],
  },
  {
    title: 'Input nominal',
    rows: [
      ['Kalikan ribu — 25k → 25.000 (juga r)', ['k']],
      ['Kalikan juta — 1,5j → 1.500.000', ['j']],
      ['Hitung langsung', ['+', '−', '×', '÷']],
      ['Selesaikan perhitungan', ['=']],
      ['Desimal', [',']],
    ],
  },
  {
    title: 'Daftar transaksi',
    rows: [
      ['Pilih baris', ['↑', '↓']],
      ['Ubah baris terpilih', ['↵']],
      ['Duplikat', ['D']],
      ['Hapus', ['⌫']],
      ['Pilih semua', [MOD, 'A']],
    ],
  },
  {
    title: 'Kalender & tanggal',
    rows: [
      ['Pindah hari', ['←', '→', '↑', '↓']],
      ['Bulan sebelum / sesudah', ['PgUp', 'PgDn']],
      ['Ke hari ini', ['T']],
      ['Catat di tanggal terpilih', ['↵']],
    ],
  },
];

export function ShortcutsDialog() {
  const open = useUI((s) => s.shortcuts);
  const set = useUI((s) => s.setShortcuts);
  return (
    <Modal open={open} onClose={() => set(false)} size="lg" title="Pintasan keyboard" subtitle="Bekerja lebih cepat tanpa meninggalkan keyboard" icon={<IconTile icon={Keyboard} size="lg" color="var(--accent-ink)" />}>
      <div className="sc-grid">
        {GROUPS.map((g) => (
          <div key={g.title} className="sc-group">
            <h4>{g.title}</h4>
            {g.rows.map(([label, k]) => (
              <div key={label} className="sc-row">
                <span>{label}</span>
                <K k={k} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}
