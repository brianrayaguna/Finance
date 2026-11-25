import { describe, expect, it, vi } from 'vitest';
import { isImeComposing, shouldHandleLayerEscape } from '../layers';

describe('isImeComposing', () => {
  it('mendeteksi sesi komposisi IME pada nativeEvent maupun KeyboardEvent biasa', () => {
    expect(isImeComposing({ isComposing: true, keyCode: 13 })).toBe(true);
    expect(isImeComposing({ nativeEvent: { isComposing: true, keyCode: 13 } })).toBe(true);
    expect(isImeComposing({ keyCode: 229 })).toBe(true);
    expect(isImeComposing({ nativeEvent: { isComposing: false, keyCode: 229 } })).toBe(true);
    expect(isImeComposing({ isComposing: false, keyCode: 13 })).toBe(false);
    expect(isImeComposing({ nativeEvent: { isComposing: false, keyCode: 13 } })).toBe(false);
  });

  it('mengabaikan tombol Escape saat komposisi IME sedang aktif', () => {
    const fn = vi.fn();
    expect(shouldHandleLayerEscape({ key: 'Escape', defaultPrevented: false, isComposing: true })).toBe(false);
    expect(shouldHandleLayerEscape({ key: 'Escape', defaultPrevented: false, keyCode: 229 })).toBe(false);
    expect(shouldHandleLayerEscape({ key: 'Escape', defaultPrevented: true, isComposing: false })).toBe(false);
    expect(shouldHandleLayerEscape({ key: 'Escape', defaultPrevented: false, isComposing: false })).toBe(true);
    void fn;
  });
});
