import { describe, expect, it } from 'vitest';
import { niceTicks } from '../format';

describe('niceTicks', () => {
  it('memakai kelipatan bulat dan selalu memuat 0 serta seluruh data', () => {
    const t = niceTicks(-8_000_000, 25_000_000);
    expect(t).toContain(0);
    expect(t[0]).toBeLessThanOrEqual(-8_000_000);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(25_000_000);
    const step = t[1] - t[0];
    expect([1, 2, 2.5, 5].some((m) => Math.abs(step / Math.pow(10, Math.floor(Math.log10(step))) - m) < 1e-9)).toBe(true);
  });

  it('data positif saja mulai dari 0; data kosong menghasilkan [0]', () => {
    expect(niceTicks(0, 100)[0]).toBe(0);
    expect(niceTicks(0, 0)).toEqual([0]);
  });
});
