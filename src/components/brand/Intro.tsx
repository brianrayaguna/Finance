import { useCallback, useEffect, useRef, useState } from 'react';
import { useLayer } from '../../lib/layers';

/**
 * Animasi pembuka. Markup & CSS-nya ada di index.html (#intro) sehingga mulai di frame pertama,
 * jauh sebelum bundel JS selesai dimuat — di perangkat lambat animasi tidak lagi terlewat atau terpotong.
 * Skrip di <head> menandai `data-intro="play" | "still"` hanya pada pembukaan pertama per sesi.
 *
 * Komponen ini hanya menutupnya: setelah total ±2,2 dtk sejak halaman mulai dimuat (minimal
 * MIN_AFTER_MOUNT setelah aplikasi siap agar peralihan tidak tersentak), lalu memudar dan dibuang.
 * Ketuk, Esc, atau tombol Kembali Android untuk melewati.
 */
const TOTAL = 1900;
const TOTAL_STILL = 700;
const MIN_AFTER_MOUNT = 300;
const FADE = 350;

export function Intro() {
  const [active, setActive] = useState(() => typeof document !== 'undefined' && !!document.documentElement.dataset.intro);
  const finishRef = useRef<() => void>(() => {});
  const skip = useCallback(() => finishRef.current(), []);
  useLayer(active, skip);

  useEffect(() => {
    const root = document.documentElement;
    const el = document.getElementById('intro');
    const mode = root.dataset.intro;
    if (!el || !mode) {
      el?.remove();
      setActive(false);
      return;
    }
    let done = false;
    const timers: number[] = [];
    const finish = () => {
      if (done) return;
      done = true;
      setActive(false);
      el.classList.add('out');
      timers.push(
        window.setTimeout(() => {
          el.remove();
          delete root.dataset.intro;
        }, FADE),
      );
    };
    finishRef.current = finish;
    const total = mode === 'still' ? TOTAL_STILL : TOTAL;
    timers.push(window.setTimeout(finish, Math.max(total - performance.now(), MIN_AFTER_MOUNT)));
    el.addEventListener('pointerdown', finish);
    return () => {
      // StrictMode memasang ulang efek: batalkan timer saja, elemen tetap untuk pemasangan berikutnya.
      timers.forEach(clearTimeout);
      el.removeEventListener('pointerdown', finish);
    };
  }, []);
  return null;
}
