import { useEffect, useMemo, useState } from 'react';
import { useData } from '../store/data';
import { usePrefs } from '../store/ui';
import { getBooks } from '../accounting/reports';
import { todayISO } from '../lib/format';

export function useBooks() {
  const data = useData((s) => s.data);
  return useMemo(() => getBooks(data), [data]);
}

/** Tanggal hari ini yang ikut berganti saat tengah malam. */
export function useToday() {
  const [t, setT] = useState(todayISO);
  useEffect(() => {
    const id = window.setInterval(() => {
      const n = todayISO();
      setT((p) => (p === n ? p : n));
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);
  return t;
}

export function useThemeSync() {
  const { theme, accent, density, reduceMotion, hideAmounts } = usePrefs();
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      const root = document.documentElement;
      root.dataset.theme = dark ? 'dark' : 'light';
      const meta = document.querySelectorAll('meta[name="theme-color"]');
      meta.forEach((m) => m.setAttribute('content', dark ? '#111112' : '#FFFFFF'));
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {
    const r = document.documentElement;
    r.dataset.accent = accent;
    r.dataset.density = density;
    delete r.dataset.glass;
    if (reduceMotion) r.dataset.motion = 'reduce';
    else delete r.dataset.motion;
    document.body.classList.toggle('privacy', hideAmounts);
  }, [accent, density, reduceMotion, hideAmounts]);
}

export function useIsDark() {
  const theme = usePrefs((s) => s.theme);
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.dataset.theme === 'dark'));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    setDark(document.documentElement.dataset.theme === 'dark');
    return () => obs.disconnect();
  }, [theme]);
  return dark;
}

export function useMediaQuery(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [q]);
  return m;
}

export function useScrolled(threshold = 24) {
  const [s, setS] = useState(false);
  useEffect(() => {
    const f = () => setS(window.scrollY > threshold);
    f();
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, [threshold]);
  return s;
}
