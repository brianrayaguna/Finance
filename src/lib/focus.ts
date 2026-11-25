/* Navigasi fokus antar-field dengan tombol Enter. Elemen field ditandai dengan atribut data-field. */
import { useEffect, useRef, type KeyboardEvent } from 'react';

function fields(scope: ParentNode): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>('[data-field]')).filter((el) => {
    if ((el as HTMLInputElement).disabled) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

/** Fokus tanpa menggulir nenek (modal-body / page) — wajib di overlay & form mobile. */
export function focusNoScroll(el: HTMLElement | null | undefined) {
  if (!el) return;
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
}

/**
 * Gulir hanya `.modal-body` atau `.dsh-body` agar `el` masuk ke area terlihat di atas keyboard
 * tanpa tertutup kepala/kaki dialog. Dipanggil setelah focusNoScroll pada kolom di dalam dialog/panel.
 */
export function ensureInModalViewport(el: HTMLElement | null | undefined, pad = 12) {
  if (!el || typeof window === 'undefined') return;
  const body = el.closest('.modal-body, .dsh-body') as HTMLElement | null;
  if (!body) return;
  const vv = window.visualViewport;
  const br = body.getBoundingClientRect();
  const vvTop = vv?.offsetTop ?? 0;
  const vvBottom = vvTop + (vv?.height ?? window.innerHeight);
  const viewTop = Math.max(vvTop, br.top) + pad;
  const viewBottom = Math.min(vvBottom, br.bottom) - pad;
  if (viewBottom <= viewTop) return;
  const r = el.getBoundingClientRect();
  if (r.top >= viewTop && r.bottom <= viewBottom) return;
  if (r.bottom > viewBottom) body.scrollTop += r.bottom - viewBottom;
  else if (r.top < viewTop) body.scrollTop -= viewTop - r.top;
}

/** Fokus aman + pastikan field terlihat di atas keyboard di dalam modal. */
export function focusField(el: HTMLElement | null | undefined) {
  if (!el) return;
  focusNoScroll(el);
  // Tunggu keyboard / vv settle sebentar di mobile.
  requestAnimationFrame(() => {
    ensureInModalViewport(el);
    requestAnimationFrame(() => ensureInModalViewport(el));
  });
}

export function focusNext(from: HTMLElement, dir: 1 | -1 = 1): boolean {
  const scope = from.closest('[data-form]') ?? from.closest('form') ?? document;
  const list = fields(scope);
  const idx = list.findIndex((el) => el === from || el.contains(from));
  const next = list[idx + dir];
  if (next) {
    focusField(next);
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
  focusField(list[0]);
}

/** Gulir opsi ke dalam listbox saja — tidak merembes ke modal-body. */
export function scrollChildIntoContainer(container: HTMLElement | null | undefined, child: HTMLElement | null | undefined) {
  if (!container || !child || !container.contains(child)) return;
  const cTop = container.scrollTop;
  const cBottom = cTop + container.clientHeight;
  const cr = container.getBoundingClientRect();
  const er = child.getBoundingClientRect();
  const relTop = er.top - cr.top + container.scrollTop;
  const relBottom = relTop + er.height;
  if (relTop < cTop) container.scrollTop = relTop;
  else if (relBottom > cBottom) container.scrollTop = relBottom - container.clientHeight;
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

/** Referensi submit terbaru; menunda satu tick macrotask bila dipicu dari AmountInput agar settle() selesai dulu. */
export function useSubmitRef<T extends unknown[]>(fn: (...args: T) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  const timer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return {
    run: (...args: T) => ref.current(...args),
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
