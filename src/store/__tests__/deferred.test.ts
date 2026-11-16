import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistStorage, StorageValue } from 'zustand/middleware';
import { deferStorage } from '../deferred';

type S = { n: number };

function fakeBase() {
  const store = new Map<string, StorageValue<S>>();
  const base: PersistStorage<S> = {
    getItem: (k) => store.get(k) ?? null,
    setItem: vi.fn((k: string, v: StorageValue<S>) => void store.set(k, v)),
    removeItem: vi.fn((k: string) => void store.delete(k)),
  };
  return { base, store };
}

const v = (n: number): StorageValue<S> => ({ state: { n }, version: 1 });
const now = (cb: () => void) => {
  cb();
  return () => {};
};

describe('deferStorage', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('menggabungkan penulisan beruntun dan hanya menulis nilai terakhir', () => {
    const { base, store } = fakeBase();
    const s = deferStorage(base, 300, now);
    s.setItem('k', v(1));
    s.setItem('k', v(2));
    vi.advanceTimersByTime(200);
    s.setItem('k', v(3));
    vi.advanceTimersByTime(299);
    expect(base.setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(base.setItem).toHaveBeenCalledTimes(1);
    expect(store.get('k')).toEqual(v(3));
  });

  it('getItem mengembalikan nilai tertunda sebelum ditulis', () => {
    const { base } = fakeBase();
    const s = deferStorage(base, 300, now);
    s.setItem('k', v(7));
    expect(s.getItem('k')).toEqual(v(7));
  });

  it('flush menulis seketika dan membatalkan timer', () => {
    const { base, store } = fakeBase();
    const s = deferStorage(base, 300, now);
    s.setItem('k', v(5));
    s.flush();
    expect(store.get('k')).toEqual(v(5));
    vi.advanceTimersByTime(1000);
    expect(base.setItem).toHaveBeenCalledTimes(1);
  });

  it('removeItem membatalkan penulisan tertunda', () => {
    const { base, store } = fakeBase();
    const s = deferStorage(base, 300, now);
    s.setItem('k', v(1));
    s.removeItem('k');
    vi.advanceTimersByTime(1000);
    expect(base.setItem).not.toHaveBeenCalled();
    expect(store.has('k')).toBe(false);
  });
});
