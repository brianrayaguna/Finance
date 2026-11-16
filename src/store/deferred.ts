import type { PersistStorage, StorageValue } from 'zustand/middleware';

type Idle = (cb: () => void) => () => void;

/** Jalankan saat browser senggang (fallback setTimeout); kembalikan fungsi pembatal. */
const onIdle: Idle = (cb) => {
  const w = globalThis as typeof globalThis & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof w.requestIdleCallback === 'function') {
    const id = w.requestIdleCallback(cb, { timeout: 1000 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = setTimeout(cb, 0);
  return () => clearTimeout(id);
};

export interface DeferredStorage<S> extends PersistStorage<S> {
  /** Tulis semua perubahan tertunda sekarang juga (sinkron). */
  flush: () => void;
}

/**
 * Membungkus penyimpanan persist agar `JSON.stringify` + `localStorage.setItem` tidak berjalan
 * di setiap perubahan: hanya nilai terakhir yang ditulis, setelah `delay` ms tanpa perubahan
 * dan saat browser senggang. Baca-setelah-tulis tetap konsisten lewat nilai tertunda.
 */
export function deferStorage<S>(base: PersistStorage<S>, delay = 300, idle: Idle = onIdle): DeferredStorage<S> {
  const pending = new Map<string, StorageValue<S>>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelIdle: (() => void) | undefined;

  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    cancelIdle?.();
    cancelIdle = undefined;
  };

  const flush = () => {
    clear();
    const items = [...pending];
    pending.clear();
    for (const [name, value] of items) void base.setItem(name, value);
  };

  const schedule = () => {
    clear();
    timer = setTimeout(() => {
      timer = undefined;
      cancelIdle = idle(() => {
        cancelIdle = undefined;
        flush();
      });
    }, delay);
  };

  return {
    getItem: (name) => (pending.has(name) ? pending.get(name)! : base.getItem(name)),
    setItem: (name, value) => {
      pending.set(name, value);
      schedule();
    },
    removeItem: (name) => {
      pending.delete(name);
      if (!pending.size) clear();
      return base.removeItem(name);
    },
    flush,
  };
}
