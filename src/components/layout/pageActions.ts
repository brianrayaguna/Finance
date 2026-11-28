import type { WindowClass } from '../../app/breakpoints';
import type { Glyph } from '../../lib/glyphs';
import type { MenuItem } from '../ui/Popover';

/** Aksi di kepala halaman: tombol biasa, atau tombol yang membuka menu pilihan (`menu`). */
export interface PageAction {
  label: string;
  icon: Glyph;
  onSelect?: () => void;
  /** Pilihan lanjutan, mis. format ekspor. Bila diisi, tombol membuka menu ini. */
  menu?: MenuItem[];
  disabled?: boolean;
  /** Sedang berjalan (mis. ekspor): tombol menampilkan indikator dan tidak bisa ditekan. */
  busy?: boolean;
}

/** Aksi sekunder yang tampil sebagai tombol di medium dan expanded; sisanya masuk menu ⋯. */
export const INLINE_SECONDARY_MAX = 2;

/**
 * Pembagian aksi sekunder: di compact semuanya masuk menu ⋯ agar baris alat tetap satu baris;
 * di layar lebih lebar dua aksi pertama tampil sebagai tombol.
 */
export function splitPageActions(actions: PageAction[], windowClass: WindowClass): { inline: PageAction[]; overflow: PageAction[] } {
  if (windowClass === 'compact') return { inline: [], overflow: actions };
  return { inline: actions.slice(0, INLINE_SECONDARY_MAX), overflow: actions.slice(INLINE_SECONDARY_MAX) };
}

export function actionMenuItem(a: PageAction): MenuItem {
  if (a.menu) return { label: a.label, icon: a.icon, submenu: a.menu, disabled: a.disabled || a.busy || undefined };
  return { label: a.label, icon: a.icon, onSelect: a.onSelect, disabled: a.disabled || a.busy || undefined };
}
