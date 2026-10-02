import { describe, expect, it } from 'vitest';
import { defaultLayout, moveWidget, packSpans, presetLayout, sanitizeLayout, sizeOf, stepWidget, PRESETS, type WidgetId } from '../dashboardLayout';
import { monthMatrix, weekDays, dayIndex } from '../../lib/week';
import { trimSeries } from '../../components/dashboard/common';
import { buildNav, defaultNavPrefs, sanitizeNavPrefs, SIMPLE_HIDDEN } from '../nav';
import { sanitizePrefs } from '../../store/ui';
import { emptyData, normalizeData } from '../../store/data';
import { buildSampleData } from '../../store/sample';
import { getBooks } from '../../accounting/reports';
import { goalProgress } from '../../accounting/goals';
import { buildInsights } from '../../accounting/insights';
import type { AppData, Transaction } from '../../accounting/types';
import { todayISO } from '../../lib/format';

describe('tata letak dasbor', () => {
  it('bawaan = tata letak lama (9 widget) dengan 4 KPI', () => {
    const l = defaultLayout();
    expect(l.order).toEqual(['hero', 'kpi', 'flow', 'health', 'recent', 'finance']);
    expect(l.kpi).toEqual(['income', 'expense', 'net', 'cash']);
    expect(sizeOf(l, 'cashflow')).toBe('l');
  });

  it('memindahkan widget sebelum/sesudah target', () => {
    const o: WidgetId[] = ['hero', 'kpi', 'cashflow', 'recent'];
    expect(moveWidget(o, 'recent', 'hero', false)).toEqual(['recent', 'hero', 'kpi', 'cashflow']);
    expect(moveWidget(o, 'hero', 'cashflow', true)).toEqual(['kpi', 'cashflow', 'hero', 'recent']);
    expect(moveWidget(o, 'hero', 'hero', true)).toBe(o);
    expect(stepWidget(o, 'kpi', -1)).toEqual(['kpi', 'hero', 'cashflow', 'recent']);
    expect(stepWidget(o, 'hero', -1)).toBe(o);
  });

  it('membersihkan tata letak rusak dari penyimpanan', () => {
    const l = sanitizeLayout({ order: ['hero', 'hero', 'tidak-ada', 'goals'], sizes: { hero: 's', goals: 'l', x: 'm' }, settings: { hero: { range: 6, bad: { a: 1 } } }, kpi: ['net', 'aneh'] });
    expect(l.order).toEqual(['hero', 'goals']);
    expect(l.sizes).toEqual({ goals: 'l' }); // 's' tidak diizinkan untuk hero
    expect(l.settings).toEqual({ hero: { range: 6 } });
    expect(l.kpi).toEqual(['net', 'income', 'expense', 'cash']);
    expect(sanitizeLayout(null)).toEqual(defaultLayout());
  });

  it('baris selalu penuh: widget terakhir melebar bila berikutnya tidak muat', () => {
    const l = defaultLayout();
    // hero 6 + kpi 6 | arus kas 8 + kesehatan 4 | terbaru 8 + keuangan 4
    expect(packSpans(l, 1200)).toEqual([6, 6, 8, 4, 8, 4]);
    const gap = { ...l, order: ['cashflow', 'insights', 'wallets'] as WidgetId[] };
    // 8 lalu 6 tidak muat → cashflow melebar ke 12; insights 6 + wallets 4 (baris terakhir boleh bercelah)
    expect(packSpans(gap, 1200)).toEqual([12, 6, 4]);
    // layar sedang: hero/kpi penuh, s/m setengah
    expect(packSpans(l, 700)).toEqual([12, 12, 12, 12, 12, 6]);
    // laptop dengan sidebar terbuka: kolom penuh seperti desktop
    expect(packSpans(l, 944)).toEqual([6, 6, 8, 4, 8, 4]);
    // ponsel: semuanya penuh
    expect(new Set(packSpans(l, 400))).toEqual(new Set([12]));
    for (const w of [400, 700, 900, 1200]) for (const s of packSpans(presetLayout('akuntan'), w)) expect(s).toBeLessThanOrEqual(12);
  });

  it('susunan bawaan lama yang belum diubah dipindah ke susunan ringkas', () => {
    const legacy = {
      order: ['hero', 'kpi', 'cashflow', 'composition', 'recent', 'wallets', 'budgets', 'debts', 'health'],
      sizes: {},
      settings: {},
      kpi: ['income', 'expense', 'net', 'cash'],
    };
    expect(sanitizeLayout(legacy)).toEqual(defaultLayout());
    // yang sudah disesuaikan pengguna tidak disentuh
    const custom = { ...legacy, sizes: { hero: 'xl' } };
    expect(sanitizeLayout(custom).order).toEqual(legacy.order);
  });

  it('semua preset hanya memakai ukuran yang diizinkan', () => {
    for (const id of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) {
      const l = presetLayout(id);
      expect(sanitizeLayout(l)).toEqual(l);
    }
  });
});

describe('navigasi', () => {
  it('favorit dipindah ke atas, menu tersembunyi & mode sederhana disaring', () => {
    const prefs = { ...defaultNavPrefs(), pinned: ['/laporan', '/jurnal'], hidden: ['/aset'] };
    const acc = buildNav(prefs, 'accountant');
    expect(acc.favorites.map((f) => f.to)).toEqual(['/laporan', '/jurnal']);
    const routes = acc.sections.flatMap((s) => s.items.map((i) => i.to));
    expect(routes).not.toContain('/aset');
    expect(routes).not.toContain('/laporan');
    const simple = buildNav(prefs, 'simple');
    expect(simple.favorites.map((f) => f.to)).toEqual(['/laporan']);
    for (const r of SIMPLE_HIDDEN) expect(simple.sections.flatMap((s) => s.items.map((i) => i.to))).not.toContain(r);
    // kelompok yang kosong tidak ditampilkan
    expect(simple.sections.some((s) => s.id === 'pelaporan')).toBe(false);
  });

  it('urutan kustom dan data navigasi rusak', () => {
    const n = sanitizeNavPrefs({ hidden: ['/x', '/aset', '/aset'], pinned: 'rusak', order: { keuangan: ['/aset', '/dompet', '/jurnal'] }, folded: ['pembukuan', 'aneh'] });
    expect(n).toEqual({ hidden: ['/aset'], pinned: [], order: { keuangan: ['/aset', '/dompet'] }, folded: ['pembukuan'] });
    expect(sanitizeNavPrefs({ folded: ['favorit', 'favorit', 'keuangan'] }).folded).toEqual(['favorit', 'keuangan']);
    const keu = buildNav(n, 'accountant').sections.find((s) => s.id === 'keuangan')!;
    expect(keu.items[0].to).toBe('/dompet');
  });
});

describe('preferensi', () => {
  it('mengabaikan nilai tidak valid', () => {
    const p = sanitizePrefs({ theme: 'ungu', weekStart: 0, landing: '/tidak-ada', reportPreset: 'this_year', mode: 'simple', compactNumbers: 'ya' });
    expect(p).toEqual({ weekStart: 0, reportPreset: 'this_year', mode: 'simple' });
  });
});

describe('target tabungan & data baru', () => {
  const today = todayISO();

  it('normalizeData membersihkan goals & templates', () => {
    const raw = {
      ...emptyData(),
      goals: [
        { id: 'g1', name: '', target: '9', accountIds: ['acc-cash', 'acc-hilang'] },
        { id: 'g2', name: 'Rumah', target: 100, accountIds: ['acc-cash', 'acc-cash'], targetDate: 'besok' },
      ],
      templates: [
        { id: 't1', name: 'Kopi', type: 'expense', amount: -0, accountId: 'acc-cash', categoryId: 'acc-hilang' },
        { id: 't2', name: 'x', type: 'journal' },
      ],
    } as unknown as AppData;
    const d = normalizeData(raw);
    expect(d.goals).toHaveLength(1);
    expect(d.goals[0]).toMatchObject({ id: 'g2', accountIds: ['acc-cash'], targetDate: undefined });
    expect(d.templates).toHaveLength(1);
    expect(d.templates[0].amount).toBeUndefined();
    expect(d.templates[0].categoryId).toBeUndefined();
    // data lama tanpa goals/templates
    const old = normalizeData({ ...emptyData(), goals: undefined, templates: undefined } as unknown as AppData);
    expect(old.goals).toEqual([]);
    expect(old.templates).toEqual([]);
  });

  it('kemajuan = saldo dompet tertaut; status tepat waktu / tertinggal', () => {
    const d = emptyData();
    let n = 0;
    const tx = (t: Partial<Transaction>) => ({ id: 'x' + ++n, amount: 0, description: '', ref: 'R' + n, createdAt: n, updatedAt: n, ...t }) as Transaction;
    const m3 = new Date();
    m3.setMonth(m3.getMonth() - 3);
    const past = m3.toISOString().slice(0, 8) + '01';
    d.transactions.push(tx({ type: 'opening', date: past, amount: 1_000_000, accountId: 'acc-cash' }), tx({ type: 'income', date: today, amount: 3_000_000, accountId: 'acc-cash', categoryId: 'acc-salary' }));
    const far = `${Number(today.slice(0, 4)) + 2}-01-01`;
    const g = { id: 'g', name: 'Dana', target: 8_000_000, targetDate: far, accountIds: ['acc-cash'], icon: 'shield', color: '#000', createdAt: 1 };
    const p = goalProgress(getBooks(d), g, today);
    expect(p.current).toBe(4_000_000);
    expect(p.pct).toBe(0.5);
    expect(p.remaining).toBe(4_000_000);
    expect(p.pace).toBe(1_000_000);
    expect(p.status).toBe('on_track');
    expect(goalProgress(getBooks(d), { ...g, targetDate: today.slice(0, 8) + '28' > today ? today.slice(0, 8) + '28' : today }, today).status).toBe('behind');
    expect(goalProgress(getBooks(d), { ...g, target: 3_000_000 }, today).status).toBe('done');
    expect(goalProgress(getBooks(d), { ...g, accountIds: [] }, today).status).toBe('unlinked');
    // laju sangat lambat: proyeksi > 100 tahun tidak boleh dianggap "sesuai jalur"
    const slow = goalProgress(getBooks(d), { ...g, target: 5_000_000_000 }, today);
    expect(slow.status).toBe('behind');
    expect(slow.projected).toBeNull();
  });

  it('wawasan otomatis pada data contoh tidak kosong dan terurut menurut tingkat', () => {
    const data = buildSampleData(emptyData().profile);
    const list = buildInsights(getBooks(data), today.slice(0, 7), today);
    expect(list.length).toBeGreaterThan(0);
    const rank = { neg: 0, warn: 1, pos: 2, info: 3 };
    for (let i = 1; i < list.length; i++) expect(rank[list[i].tone]).toBeGreaterThanOrEqual(rank[list[i - 1].tone]);
  });

  it('wawasan memperingatkan saldo dompet negatif', () => {
    const d = emptyData();
    d.transactions.push({ id: 'e1', type: 'expense', date: today, amount: 10_000, accountId: 'acc-cash', categoryId: 'acc-food', description: '', ref: 'BKK/1', createdAt: 1, updatedAt: 1 });
    const list = buildInsights(getBooks(d), today.slice(0, 7), today);
    expect(list.some((i) => i.id === 'neg-acc-cash' && i.tone === 'neg')).toBe(true);
  });
});

describe('kalender & deret dasbor', () => {
  it('awal pekan Senin atau Minggu', () => {
    expect(weekDays(1).map((w) => w.label)).toEqual(['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']);
    expect(weekDays(0).map((w) => w.label)[0]).toBe('Min');
    expect(weekDays(0).filter((w) => w.weekend).length).toBe(2);
    // 1 September 2026 jatuh pada Selasa
    expect(monthMatrix('2026-09-01', 1)[0]).toBe('2026-08-31');
    expect(monthMatrix('2026-09-01', 0)[0]).toBe('2026-08-30');
    expect(dayIndex('2026-09-06', 0)).toBe(0);
    expect(dayIndex('2026-09-06', 1)).toBe(6);
  });

  it('memangkas bulan sebelum pencatatan dimulai', () => {
    const m = (month: string, income = 0, expense = 0, netWorth = 0) => ({ month, income, expense, netWorth });
    const all = [m('2026-01', 0, 300, 100), m('2026-02', 0, 300, 100), m('2026-03', 5, 1, 9), m('2026-04', 5, 1, 9), m('2026-05', 5, 1, 9), m('2026-06', 5, 1, 9)];
    expect(trimSeries(all, '2026-03').map((x) => x.month)).toEqual(['2026-03', '2026-04', '2026-05', '2026-06']);
    // minimal 3 bulan
    expect(trimSeries(all, '2026-06')).toHaveLength(3);
    // tanpa transaksi: patokan aktivitas
    expect(trimSeries(all)[0].month).toBe('2026-01');
  });
});
