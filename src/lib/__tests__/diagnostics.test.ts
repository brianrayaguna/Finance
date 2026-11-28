import { describe, expect, it } from 'vitest';
import {
  describeLite,
  formatDiagnostics,
  formatInsets,
  formatNumber,
  formatRatio,
  parseAndroidVersion,
  parseEngineVersion,
} from '../diagnostics';

const WEBVIEW_UA =
  'Mozilla/5.0 (Linux; Android 14; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.135 Mobile Safari/537.36';

describe('parseEngineVersion / parseAndroidVersion', () => {
  it('membaca versi mesin dan versi Android dari user agent WebView', () => {
    expect(parseEngineVersion(WEBVIEW_UA)).toBe('131.0.6778.135');
    expect(parseAndroidVersion(WEBVIEW_UA)).toBe('14');
  });

  it('mengembalikan null bila token tidak ada', () => {
    const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko)';
    expect(parseEngineVersion(ua)).toBeNull();
    expect(parseAndroidVersion(ua)).toBeNull();
  });
});

describe('format', () => {
  it('meringkas bilangan pecahan dan menolak nilai tak hingga', () => {
    expect(formatNumber(2.625)).toBe('2.63');
    expect(formatNumber(3)).toBe('3');
    expect(formatNumber(Number.NaN)).toBe('–');
  });

  it('menyusun sisipan area aman searah jarum jam', () => {
    expect(formatInsets({ top: 24, right: 0, bottom: 47.5, left: 0 })).toBe('atas 24 · kanan 0 · bawah 47.5 · kiri 0 px');
  });

  it('menampilkan rasio sebagai persen bulat', () => {
    expect(formatRatio(1.3)).toBe('130%');
    expect(formatRatio(1)).toBe('100%');
    expect(formatRatio(Number.NaN)).toBe('–');
    expect(formatRatio(0)).toBe('–');
  });

  it('menjelaskan sumber status mode hemat', () => {
    expect(describeLite('auto', true)).toBe('Aktif (otomatis, perangkat terdeteksi lemah)');
    expect(describeLite('auto', false)).toBe('Mati (otomatis, perangkat tidak terdeteksi lemah)');
    expect(describeLite('on', false)).toBe('Aktif (diatur manual)');
    expect(describeLite('off', true)).toBe('Mati (diatur manual)');
  });

  it('menghasilkan satu baris "label: nilai" per entri untuk disalin', () => {
    expect(
      formatDiagnostics([
        { label: 'Aplikasi', value: '1.5.0' },
        { label: 'Rasio piksel perangkat', value: '2.63' },
      ]),
    ).toBe('Aplikasi: 1.5.0\nRasio piksel perangkat: 2.63');
  });
});
