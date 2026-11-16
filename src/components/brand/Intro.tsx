import { useEffect, useState } from 'react';
import { LogoMark } from './Logo';
import { usePrefs } from '../../store/ui';

/**
 * Animasi pembuka saat aplikasi dibuka: kotak merah muncul, koin berputar sekali, lalu nama aplikasi.
 * Hanya sekali per sesi (bukan saat pindah halaman atau muat ulang); ketuk atau Esc untuk melewati.
 * Tanda dibaca sekali saat modul dimuat agar StrictMode tidak memutarnya dua kali.
 *
 * CSS murni (lihat `.intro` di base.css): mulai di frame pertama tanpa menunggu framer-motion
 * dimuat, sehingga durasinya sama di HP lambat maupun cepat.
 */
const FIRST_OPEN = (() => {
  try {
    if (sessionStorage.getItem('neraca.intro')) return false;
    sessionStorage.setItem('neraca.intro', '1');
  } catch {
    /* penyimpanan sesi tidak tersedia: tetap tampilkan sekali */
  }
  return true;
})();

/** Lama tampil sebelum mulai memudar, dan lama memudar (ms). */
const HOLD = 1900;
const HOLD_REDUCED = 600;
const FADE = 350;

type Phase = 'in' | 'out' | 'gone';

export function Intro() {
  const [phase, setPhase] = useState<Phase>(FIRST_OPEN ? 'in' : 'gone');
  const prefReduce = usePrefs((s) => s.reduceMotion);
  const reduce = prefReduce || (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    if (phase !== 'in') return;
    const t = window.setTimeout(() => setPhase('out'), reduce ? HOLD_REDUCED : HOLD);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPhase('out');
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [phase, reduce]);

  useEffect(() => {
    if (phase !== 'out') return;
    const t = window.setTimeout(() => setPhase('gone'), reduce ? 200 : FADE);
    return () => window.clearTimeout(t);
  }, [phase, reduce]);

  if (phase === 'gone') return null;
  return (
    <div className={`intro${reduce ? ' still' : ''}${phase === 'out' ? ' out' : ''}`} aria-hidden onPointerDown={() => setPhase('out')}>
      <div className="intro-mark">
        <LogoMark size={88} coinClassName="intro-coin" />
      </div>
      <span className="intro-name">Keuanganku</span>
    </div>
  );
}
