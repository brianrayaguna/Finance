import { useEffect } from 'react';

/**
 * Animasi pembuka. Markup & CSS-nya ada di index.html (#intro) sehingga mulai di frame pertama,
 * jauh sebelum bundel JS selesai dimuat — di HP lambat animasi tidak lagi terlewat atau terpotong.
 * Skrip di <head> menandai `data-intro="play" | "still"` hanya pada pembukaan pertama per sesi.
 *
 * Komponen ini hanya menutupnya: setelah total ±2,2 dtk sejak halaman mulai dimuat (minimal
 * MIN_AFTER_MOUNT setelah aplikasi siap agar peralihan tidak tersentak), lalu memudar dan dibuang.
 * Ketuk atau Esc untuk melewati.
 */
const TOTAL = 1900;
const TOTAL_STILL = 700;
const MIN_AFTER_MOUNT = 300;
const FADE = 350;

export function Intro() {
  useEffect(() => {
    const root = document.documentElement;
    const el = document.getElementById('intro');
    const mode = root.dataset.intro;
    if (!el || !mode) {
      el?.remove();
      return;
    }
    let done = false;
    const timers: number[] = [];
    const finish = () => {
      if (done) return;
      done = true;
      el.classList.add('out');
      timers.push(
        window.setTimeout(() => {
          el.remove();
          delete root.dataset.intro;
        }, FADE),
      );
      window.removeEventListener('keydown', onKey);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    const total = mode === 'still' ? TOTAL_STILL : TOTAL;
    timers.push(window.setTimeout(finish, Math.max(total - performance.now(), MIN_AFTER_MOUNT)));
    el.addEventListener('pointerdown', finish);
    window.addEventListener('keydown', onKey);
    return () => {
      // StrictMode memasang ulang efek: batalkan timer saja, elemen tetap untuk pemasangan berikutnya.
      timers.forEach(clearTimeout);
      el.removeEventListener('pointerdown', finish);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  return null;
}
