import { useSyncExternalStore } from 'react';

/**
 * Animasi grafik & angka dimatikan bila pengguna meminta gerak dikurangi (`data-motion="reduce"`,
 * diatur useThemeSync dari preferensi + sistem), perangkat lemah (`data-perf="lite"`), atau layar
 * sentuh. Di HP, animasi grafik (Recharts, cincin, hitung-naik angka) dihitung JavaScript setiap
 * frame dan berebut main thread dengan render halaman — sumber utama animasi patah-patah.
 * Dibaca dari atribut <html> agar tidak perlu framer-motion di jalur ini.
 */
const TOUCH = '(pointer: coarse)';

export function lessMotionNow() {
  const d = document.documentElement.dataset;
  return d.motion === 'reduce' || d.perf === 'lite' || window.matchMedia(TOUCH).matches;
}

const subscribe = (cb: () => void) => {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion', 'data-perf'] });
  const mq = window.matchMedia(TOUCH);
  mq.addEventListener('change', cb);
  return () => {
    obs.disconnect();
    mq.removeEventListener('change', cb);
  };
};

export function useLessMotion() {
  return useSyncExternalStore(subscribe, lessMotionNow, () => false);
}
