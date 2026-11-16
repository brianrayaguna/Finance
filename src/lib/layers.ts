/* Layer stack: memastikan tombol Escape hanya menutup lapisan paling atas (popover → modal → dll). */
import { useEffect, useRef } from 'react';

type Layer = { id: number; onEscape: () => void };
const stack: Layer[] = [];
let seq = 0;
let bound = false;

function bind() {
  if (bound || typeof window === 'undefined') return;
  bound = true;
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const top = stack[stack.length - 1];
      if (top) {
        e.preventDefault();
        e.stopPropagation();
        top.onEscape();
      }
    },
    true,
  );
}

export function useLayer(active: boolean, onEscape: () => void) {
  const ref = useRef(onEscape);
  ref.current = onEscape;
  useEffect(() => {
    if (!active) return;
    bind();
    const layer: Layer = { id: ++seq, onEscape: () => ref.current() };
    stack.push(layer);
    return () => {
      const i = stack.findIndex((l) => l.id === layer.id);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}

export const layerCount = () => stack.length;

/** Tutup lapisan paling atas (dipakai tombol back Android). Mengembalikan true bila ada yang ditutup. */
export function closeTopLayer(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.onEscape();
  return true;
}

export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/** Benar selama sesi komposisi IME aktif (CJK/aksen), agar Enter/pintasan tidak memicu aksi prematur. */
export function isImeComposing(e: {
  nativeEvent?: { isComposing?: boolean; keyCode?: number };
  isComposing?: boolean;
  keyCode?: number;
}): boolean {
  const ne = e.nativeEvent ?? e;
  return !!ne.isComposing || ne.keyCode === 229;
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const MOD = isMac ? '⌘' : 'Ctrl';
export const ALT = isMac ? '⌥' : 'Alt';
export const modKey = (k: string) => (isMac ? `⌘${k}` : `Ctrl ${k}`);
