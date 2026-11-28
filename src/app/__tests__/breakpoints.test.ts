import { describe, expect, it } from 'vitest';
import { EXPANDED_MIN, MEDIUM_MIN, WINDOW_MEDIA, sidebarRail, windowClassOf } from '../breakpoints';

describe('kelas ukuran jendela', () => {
  it('compact di bawah 600px, medium 600–1023px, expanded mulai 1024px', () => {
    expect(windowClassOf(360)).toBe('compact');
    expect(windowClassOf(599.5)).toBe('compact');
    expect(windowClassOf(600)).toBe('medium');
    expect(windowClassOf(1023.9)).toBe('medium');
    expect(windowClassOf(1024)).toBe('expanded');
    expect(windowClassOf(1440)).toBe('expanded');
  });

  it('media query memakai batas yang sama dengan klasifikasi', () => {
    expect(MEDIUM_MIN).toBe(600);
    expect(EXPANDED_MIN).toBe(1024);
    expect(WINDOW_MEDIA.compact).toBe('(width < 600px)');
    expect(WINDOW_MEDIA.medium).toBe('(600px <= width < 1024px)');
    expect(WINDOW_MEDIA.expanded).toBe('(width >= 1024px)');
    expect(WINDOW_MEDIA.belowExpanded).toBe('(width < 1024px)');
  });
});

describe('rail sidebar', () => {
  it('medium selalu rail kecuali laci dibuka, apa pun preferensinya', () => {
    expect(sidebarRail('medium', false, false)).toBe(true);
    expect(sidebarRail('medium', true, false)).toBe(true);
    expect(sidebarRail('medium', true, true)).toBe(false);
  });

  it('expanded mengikuti preferensi ciut; compact tidak pernah rail', () => {
    expect(sidebarRail('expanded', true, false)).toBe(true);
    expect(sidebarRail('expanded', false, false)).toBe(false);
    expect(sidebarRail('compact', true, false)).toBe(false);
    expect(sidebarRail('compact', true, true)).toBe(false);
  });
});
