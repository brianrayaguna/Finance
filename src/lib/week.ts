/*
 * Awal pekan (Senin atau Minggu) untuk semua kalender: pemilih tanggal, halaman Kalender,
 * tampilan tahunan, dan peta panas di dasbor.
 */
import { addDays, parseISO, startOfMonth } from './format';

/** 0 = Minggu, 1 = Senin (mengikuti Date.getDay) */
export type WeekStart = 0 | 1;

const SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const LONG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const LETTER = ['M', 'S', 'S', 'R', 'K', 'J', 'S'];

export interface WeekDay {
  label: string;
  weekend: boolean;
}

/** Tujuh label hari sesuai awal pekan. */
export function weekDays(weekStart: WeekStart, style: 'short' | 'long' | 'letter' = 'short'): WeekDay[] {
  const names = style === 'long' ? LONG : style === 'letter' ? LETTER : SHORT;
  return Array.from({ length: 7 }, (_, i) => {
    const d = (i + weekStart) % 7;
    return { label: names[d], weekend: d === 0 || d === 6 };
  });
}

/** Posisi tanggal dalam pekan (0..6) sesuai awal pekan. */
export const dayIndex = (iso: string, weekStart: WeekStart): number => (parseISO(iso).getDay() - weekStart + 7) % 7;

export const isWeekend = (iso: string): boolean => {
  const d = parseISO(iso).getDay();
  return d === 0 || d === 6;
};

/** 6 × 7 tanggal yang menampilkan satu bulan penuh, dimulai dari awal pekan. */
export function monthMatrix(monthISO: string, weekStart: WeekStart = 1): string[] {
  const first = startOfMonth(monthISO);
  const start = addDays(first, -dayIndex(first, weekStart));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
