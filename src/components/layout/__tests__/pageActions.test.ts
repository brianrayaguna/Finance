import { describe, expect, it } from 'vitest';
import type { Glyph } from '../../../lib/glyphs';
import { actionMenuItem, splitPageActions, type PageAction } from '../pageActions';

const Icon = (() => null) as unknown as Glyph;
const act = (label: string, extra: Partial<PageAction> = {}): PageAction => ({ label, icon: Icon, onSelect: () => {}, ...extra });

describe('pembagian aksi sekunder', () => {
  const four = [act('Masuk'), act('Keluar'), act('Opname'), act('Transfer')];

  it('compact: semua aksi sekunder masuk menu ⋯', () => {
    const r = splitPageActions(four, 'compact');
    expect(r.inline).toEqual([]);
    expect(r.overflow.map((a) => a.label)).toEqual(['Masuk', 'Keluar', 'Opname', 'Transfer']);
  });

  it('medium dan expanded: dua aksi pertama tampil sebagai tombol, sisanya di menu ⋯', () => {
    for (const wc of ['medium', 'expanded'] as const) {
      const r = splitPageActions(four, wc);
      expect(r.inline.map((a) => a.label)).toEqual(['Masuk', 'Keluar']);
      expect(r.overflow.map((a) => a.label)).toEqual(['Opname', 'Transfer']);
    }
  });

  it('tanpa aksi sekunder tidak ada menu ⋯', () => {
    expect(splitPageActions([], 'compact')).toEqual({ inline: [], overflow: [] });
  });
});

describe('aksi sebagai butir menu', () => {
  it('aksi biasa menjadi butir yang bisa dipilih', () => {
    const onSelect = () => {};
    expect(actionMenuItem(act('Ekspor', { onSelect, disabled: true }))).toEqual({ label: 'Ekspor', icon: Icon, onSelect, disabled: true });
  });

  it('aksi bermenu menjadi anak menu', () => {
    const menu = [{ label: 'Akun terpilih (.xlsx)' }, { label: 'Semua akun (.xlsx)' }];
    expect(actionMenuItem(act('Ekspor', { onSelect: undefined, menu }))).toEqual({ label: 'Ekspor', icon: Icon, submenu: menu, disabled: undefined });
  });

  it('aksi yang sedang berjalan tidak bisa dipilih', () => {
    expect(actionMenuItem(act('Ekspor', { busy: true })).disabled).toBe(true);
  });
});
