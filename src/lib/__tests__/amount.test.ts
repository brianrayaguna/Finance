import { describe, expect, it } from 'vitest';
import { amountToDisplay, evaluateAmount, formatAmountString, normalizePasted, sanitizeAmount } from '../amount';
import { formatRatio } from '../format';

describe('input nominal', () => {
  it('kalkulator aman tanpa eval', () => {
    expect(evaluateAmount('1.250.000 + 25.000')).toBe(1_275_000);
    expect(evaluateAmount('100×3−50')).toBe(250);
    expect(evaluateAmount('(10+5)÷3')).toBe(5);
    expect(evaluateAmount('1.000/0')).toBeNull();
    expect(evaluateAmount('1.000+')).toBe(1000);
  });

  it('format ribuan & desimal Indonesia', () => {
    expect(formatAmountString(sanitizeAmount('1250000,5'))).toBe('1.250.000,5');
    expect(amountToDisplay(-1250.5)).toBe('-1.250,5');
    expect(amountToDisplay(0)).toBe('');
  });

  it('menormalkan teks yang ditempel', () => {
    expect(normalizePasted('1250000.50')).toBe('1250000,50');
    expect(normalizePasted('1,250,000.75')).toBe('1250000,75');
    expect(normalizePasted('Rp 1.250.000')).toBe('1.250.000');
    expect(normalizePasted('IDR 15.000,5')).toBe('15.000,5');
    expect(normalizePasted('halo')).toBeNull();
  });
});

describe('formatRatio', () => {
  it('memakai pemisah Indonesia dan membatasi desimal untuk angka besar', () => {
    expect(formatRatio(18.4321, 'x')).toBe('18,43x');
    expect(formatRatio(1446.27, 'x')).toBe('1.446x');
    expect(formatRatio(8.24, 'bulan')).toBe('8,2 bln');
    expect(formatRatio(null, 'x')).toBe('—');
  });
});
