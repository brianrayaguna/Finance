/**
 * Kelas ukuran jendela — satu-satunya sumber batas lebar untuk kerangka aplikasi.
 *
 * - compact  (< 600px): navigasi bawah, satu kolom, judul halaman di bilah atas.
 * - medium   (600–1023px): sidebar sebagai rail ikon.
 * - expanded (≥ 1024px): sidebar penuh (bisa diciutkan pengguna).
 *
 * CSS memakai media query dengan angka yang sama dalam sintaks rentang (`width < 600px`, dst.);
 * `scripts/css-guard.mjs` menolak lebar media query lain. Komponen di dalam halaman menyesuaikan
 * diri lewat container query, bukan lewat kelas ini.
 */

export type WindowClass = 'compact' | 'medium' | 'expanded';

export const MEDIUM_MIN = 600;
export const EXPANDED_MIN = 1024;

export const WINDOW_MEDIA = {
  compact: `(width < ${MEDIUM_MIN}px)`,
  medium: `(${MEDIUM_MIN}px <= width < ${EXPANDED_MIN}px)`,
  expanded: `(width >= ${EXPANDED_MIN}px)`,
  /** compact atau medium: sidebar penuh tidak tampil. */
  belowExpanded: `(width < ${EXPANDED_MIN}px)`,
} as const;

export function windowClassOf(width: number): WindowClass {
  if (width < MEDIUM_MIN) return 'compact';
  if (width < EXPANDED_MIN) return 'medium';
  return 'expanded';
}

/** Kelas saat ini menurut media query (lebar viewport CSS yang sama dengan yang dibaca stylesheet). */
export function currentWindowClass(): WindowClass {
  if (typeof window === 'undefined') return 'expanded';
  if (window.matchMedia(WINDOW_MEDIA.compact).matches) return 'compact';
  if (window.matchMedia(WINDOW_MEDIA.belowExpanded).matches) return 'medium';
  return 'expanded';
}

/**
 * Sidebar tampil sebagai rail ikon: selalu di medium kecuali lacinya sedang dibuka, dan di expanded
 * bila pengguna menciutkannya. Di compact sidebar hanya berupa laci, jadi selalu penuh.
 */
export function sidebarRail(windowClass: WindowClass, collapsedPref: boolean, drawerOpen: boolean): boolean {
  if (windowClass === 'medium') return !drawerOpen;
  return windowClass === 'expanded' && collapsedPref;
}
