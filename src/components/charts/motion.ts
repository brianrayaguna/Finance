import { useSyncExternalStore } from 'react';

/**
 * Animasi grafik dimatikan bila pengguna meminta gerak dikurangi (`data-motion="reduce"`,
 * diatur useThemeSync dari preferensi + sistem) atau perangkat lemah (`data-perf="lite"`).
 * Dibaca dari atribut <html> agar tidak perlu framer-motion di jalur ini.
 */
const read = () => {
  const d = document.documentElement.dataset;
  return d.motion === 'reduce' || d.perf === 'lite';
};

const subscribe = (cb: () => void) => {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion', 'data-perf'] });
  return () => obs.disconnect();
};

export function useLessMotion() {
  return useSyncExternalStore(subscribe, read, () => false);
}
