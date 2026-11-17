import { useSyncExternalStore, type CSSProperties } from 'react';

/*
 * Aturan gerak agar animasi tetap mulus di HP:
 * - Animasi masuk daftar/kartu memakai CSS (`[data-enter]` di base.css): transform + opacity
 *   dijalankan compositor, tidak memakan main thread yang sedang merender halaman.
 * - Bila tetap memakai framer-motion, animasikan `transform` sebagai string utuh
 *   (mis. 'translateY(-4px) scale(.96)'), BUKAN `x`/`y`/`scale` terpisah. Hanya `transform`
 *   & `opacity` yang diteruskan framer ke Web Animations API (GPU); `x`/`y`/`scale` dihitung
 *   JavaScript setiap frame.
 */

/** Hanya N item pertama yang beranimasi masuk; sisanya (umumnya di luar layar) langsung tampil. */
export const ENTER_MAX = 6;
/** Jeda antar-item saat beranimasi masuk bergiliran. */
export const ENTER_STEP_MS = 40;

/**
 * Atribut animasi masuk CSS untuk item ke-`i`. Sebarkan ke elemen: `<div {...enter(i, style)} />`.
 * `style` milik elemen (bila ada) digabung di sini agar tidak saling menimpa.
 */
export function enter(i = 0, style?: CSSProperties): { 'data-enter'?: ''; style?: CSSProperties } {
  if (i >= ENTER_MAX) return style ? { style } : {};
  return { 'data-enter': '', style: { ...style, '--enter-delay': `${i * ENTER_STEP_MS}ms` } as CSSProperties };
}

const readReduce = () => document.documentElement.dataset.motion === 'reduce';
const subscribeReduce = (cb: () => void) => {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  return () => obs.disconnect();
};

/** Gerak dikurangi (preferensi aplikasi atau sistem) — `data-motion="reduce"` dari useThemeSync. */
export function useReduceMotion() {
  return useSyncExternalStore(subscribeReduce, readReduce, () => false);
}

/**
 * Nilai `transform` awal/keluar untuk framer-motion: `tf(dari, diam)`.
 * - `diam` adalah posisi akhir yang juga dipakai di `animate`, dengan DAFTAR FUNGSI YANG SAMA
 *   (mis. dari 'translateY(-4px) scale(.96)' ke 'translateY(0px) scale(1)'). Jangan 'none':
 *   framer mengubahnya menjadi versi nol dari string lawannya (scale(0)) sehingga elemen lenyap.
 * - framer tidak meredam string `transform` saat gerak dikurangi (hanya `x`/`y`/`scale`), jadi saat
 *   gerak dikurangi nilai awal = `diam` dan elemen hanya memudar.
 */
export function useTransformFrom() {
  const reduce = useReduceMotion();
  return (from: string, rest: string) => (reduce ? rest : from);
}
