import { useEffect, useState } from 'react';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { LogoMark } from './Logo';
import { usePrefs } from '../../store/ui';

/**
 * Animasi pembuka saat aplikasi dibuka: kotak merah muncul, koin berputar sekali, lalu nama aplikasi.
 * Hanya sekali per sesi (bukan saat pindah halaman atau muat ulang); ketuk atau Esc untuk melewati.
 * Tanda dibaca sekali saat modul dimuat agar StrictMode tidak memutarnya dua kali.
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

export function Intro() {
  const [show, setShow] = useState(FIRST_OPEN);
  const prefReduce = usePrefs((s) => s.reduceMotion);
  const reduce = useReducedMotion() || prefReduce;

  useEffect(() => {
    if (!show) return;
    const t = window.setTimeout(() => setShow(false), reduce ? 250 : 1000);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShow(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [show, reduce]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className={`intro${reduce ? ' still' : ''}`}
          aria-hidden
          onPointerDown={() => setShow(false)}
          initial={false}
          exit={{ opacity: 0, transition: { duration: reduce ? 0.2 : 0.22, ease: [0.16, 1, 0.3, 1] } }}
        >
          <motion.div
            className="intro-mark"
            initial={reduce ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 22 }}
          >
            <LogoMark size={88} coinClassName="intro-coin" />
          </motion.div>
          <motion.span
            className="intro-name"
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.42, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            Keuanganku
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
