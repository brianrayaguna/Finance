import { User, Palette, SlidersHorizontal, ListTree, Database, Info, type Glyph } from '../lib/glyphs';

/** Bagian Pengaturan; masing-masing punya halaman sendiri di /pengaturan/:bagian. */
export const SETTINGS_SECTIONS: { id: string; label: string; desc: string; icon: Glyph }[] = [
  { id: 'profil', label: 'Profil & buku', desc: 'Nama, nama buku, tahun buku, kunci periode', icon: User },
  { id: 'tampilan', label: 'Tampilan & mode', desc: 'Tema, warna aksen, mode Sederhana atau Akuntan', icon: Palette },
  { id: 'preferensi', label: 'Preferensi', desc: 'Halaman awal, periode laporan, privasi nominal', icon: SlidersHorizontal },
  { id: 'navigasi', label: 'Menu & navigasi', desc: 'Tab bawah, modul, Favorit, dan urutan menu', icon: ListTree },
  { id: 'data', label: 'Data & cadangan', desc: 'Integritas buku, cadangan, pulihkan, atur ulang', icon: Database },
  { id: 'tentang', label: 'Tentang', desc: 'Versi aplikasi dan atribusi', icon: Info },
];
