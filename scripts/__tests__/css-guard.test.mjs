import { describe, expect, it } from 'vitest';
import { compareToBaseline, countCss, countTsx, offScaleMedia } from '../css-guard.mjs';

describe('lebar media query', () => {
  it('menerima sintaks rentang dengan batas 600 dan 1024 saja', () => {
    const css = `
      @media (width < 600px) { a { color: red } }
      @media (600px <= width < 1024px) { a { color: red } }
      @media (width >= 1024px) { a { color: red } }
      @media (pointer: coarse), (width < 1024px) { a { color: red } }
      @media (hover: hover) { a { color: red } }
      @media print { a { color: red } }
      @container (max-width: 640px) { a { color: red } }`;
    expect(offScaleMedia(css)).toEqual([]);
  });

  it('menolak batas lain dan sintaks min-/max-width', () => {
    const css = `a {}
@media (max-width: 760px) { a { color: red } }
@media (width < 640px) { a { color: red } }
@media (max-width: 600px) { a { color: red } }
@media screen and (min-width: 1024px) { a { color: red } }`;
    expect(offScaleMedia(css).map((m) => m.line)).toEqual([2, 3, 4, 5]);
  });
});

describe('penghitung', () => {
  it('menghitung !important dan tinggi tetap dalam px, bukan min-/max-/line-height', () => {
    const css = `
      a { height: 40px; min-height: 40px; max-height: 80px; line-height: 20px; }
      b { height: 2.5rem; color: red !important; }
      c { height:12px !important; }`;
    expect(countCss(css)).toEqual({ important: 2, fixedHeight: 2 });
  });

  it('menghitung gaya inline di TSX', () => {
    const tsx = `<div style={{ width: 1 }} /><span style={{ '--pct': x } as CSSProperties} /><p className="x" />`;
    expect(countTsx(tsx)).toEqual({ inlineStyle: 2 });
  });
});

describe('pembanding dengan angka dasar', () => {
  const base = { offScaleMedia: 10, important: 5, fixedHeight: 7, inlineStyle: 3 };

  it('lulus bila sama dengan angka dasar', () => {
    expect(compareToBaseline({ ...base }, base)).toEqual({ increased: [], decreased: [] });
  });

  it('melaporkan metrik yang naik dan yang turun', () => {
    const r = compareToBaseline({ offScaleMedia: 11, important: 4, fixedHeight: 7, inlineStyle: 3 }, base);
    expect(r.increased).toEqual([{ key: 'offScaleMedia', now: 11, base: 10 }]);
    expect(r.decreased).toEqual([{ key: 'important', now: 4, base: 5 }]);
  });
});
