import type { PerfMode } from '../store/ui';

/**
 * Perangkat dianggap lemah bila RAM ≤ 4 GB (navigator.deviceMemory, Chrome/WebView Android)
 * atau CPU ≤ 4 inti. Logika yang sama ada di skrip awal index.html agar atribut terpasang
 * sebelum render pertama — ubah keduanya bersamaan.
 */
export function isLowEndDevice(nav: Pick<Navigator, 'hardwareConcurrency'> & { deviceMemory?: number } = navigator): boolean {
  const mem = nav.deviceMemory;
  const cores = nav.hardwareConcurrency;
  return (typeof mem === 'number' && mem > 0 && mem <= 4) || (typeof cores === 'number' && cores > 0 && cores <= 4);
}

export function resolveLite(mode: PerfMode, lowEnd = isLowEndDevice()): boolean {
  return mode === 'on' || (mode === 'auto' && lowEnd);
}
