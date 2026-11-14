/* Navigasi fokus antar-field dengan tombol Enter. Elemen field ditandai dengan atribut data-field. */
import { useEffect, useRef, type KeyboardEvent } from 'react';

function fields(scope: ParentNode): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>('[data-field]')).filter((el) => {
    if ((el as HTMLInputElement).disabled) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

export function focusNext(from: HTMLElement, dir: 1 | -1 = 1): boolean {
  const scope = from.closest('[data-form]') ?? from.closest('form') ?? document;
  const list = fields(scope);
  const idx = list.findIndex((el) => el === from || el.contains(from));
  const next = list[idx + dir];
  if (next) {
    next.focus();
    if (next instanceof HTMLInputElement && next.type !== 'checkbox') {
      requestAnimationFrame(() => next.select?.());
    }
    return true;
  }
  return false;
}

export function focusFirst(scope: ParentNode | null | undefined) {
  if (!scope) return;
  const list = fields(scope);
  list[0]?.focus();
}

/** Baris tabel yang dapat diklik: bisa difokus dan dijalankan dengan Enter atau Spasi. */
export function rowAction(run: (() => void) | undefined) {
  if (!run) return {};
  return {
    tabIndex: 0,
    onClick: run,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        run();
      }
    },
  };
}

/** Menghormati pengaturan Kurangi Gerak & prefers-reduced-motion saat menggulir terprogram. */
export function scrollBehavior(): ScrollBehavior {
  if (typeof window === 'undefined') return 'auto';
  const reduced = document.documentElement.dataset.motion === 'reduce' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return reduced ? 'auto' : 'smooth';
}

/** Referensi submit terbaru; menunda satu tick macrotask bila dipicu dari AmountInput agar settle() selesai dulu. */
export function useSubmitRef<T extends unknown[]>(fn: (...args: T) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  const timer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return {
    run: (...args: T) => ref.current(...args),
    defer: (...args: T) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = 0;
        ref.current(...args);
      }, 0);
    },
    runFrom: (target: EventTarget | null, ...args: T) => {
      const inAmount = target instanceof Element && !!target.closest('.amount-input, .amount-inline');
      if (!inAmount) {
        ref.current(...args);
        return;
      }
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = 0;
        ref.current(...args);
      }, 0);
    },
  };
}
