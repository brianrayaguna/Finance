import { useLayoutEffect, useRef } from 'react';

type Box = { x: number; y: number; w: number; h: number };

/** Posisi terakhir tiap grup penanda, relatif terhadap wadah `[data-pill-root]`. */
const last = new Map<string, Box>();

const lessMotion = () => {
  const d = document.documentElement.dataset;
  return d.motion === 'reduce' || d.perf === 'lite';
};

/**
 * Penanda item aktif yang "meluncur" dari item sebelumnya (pengganti `layoutId` framer-motion).
 * Teknik FLIP: ukur posisi lama & baru sekali, lalu animasikan `transform` lewat Web Animations API
 * sehingga berjalan di compositor tanpa pengukuran layout per frame.
 * Taruh di dalam item aktif; wadah daftar diberi atribut `data-pill-root`.
 */
export function SlidePill({ group, className, duration = 260 }: { group: string; className: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = el.closest<HTMLElement>('[data-pill-root]') ?? el.parentElement?.parentElement ?? document.body;
    const rr = root.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const now: Box = { x: r.left - rr.left + root.scrollLeft, y: r.top - rr.top + root.scrollTop, w: r.width, h: r.height };
    const prev = last.get(group);
    last.set(group, now);
    if (!prev || !now.w || !now.h || typeof el.animate !== 'function' || lessMotion()) return;
    const dx = prev.x - now.x;
    const dy = prev.y - now.y;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(prev.w - now.w) < 0.5) return;
    el.animate(
      [
        { transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${prev.w / now.w}, ${prev.h / now.h})` },
        { transformOrigin: '0 0', transform: 'none' },
      ],
      { duration, easing: 'cubic-bezier(.2, .9, .25, 1)' },
    );
  }, [group, duration]);
  return <span ref={ref} className={className} aria-hidden />;
}
