import type { PerfMode } from '../store/ui';
import { isLowEndDevice, resolveLite } from './perf';

/**
 * Diagnostik runtime WebView untuk APK: versi mesin, ukuran viewport, rasio piksel, area aman,
 * zoom teks efektif, dan mode hemat. Dipakai di Pengaturan › Tentang untuk membandingkan tampilan
 * APK dengan versi web di perangkat sungguhan.
 */

export interface DiagnosticEntry {
  label: string;
  value: string;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const SIDE_LABEL: Record<(typeof SIDES)[number], string> = { top: 'atas', right: 'kanan', bottom: 'bawah', left: 'kiri' };

/** Versi mesin WebView dari token versi di user agent (`Chrome/x.y.z.w`), atau null bila tidak ada. */
export function parseEngineVersion(ua: string): string | null {
  return /Chrome\/(\d+(?:\.\d+)*)/.exec(ua)?.[1] ?? null;
}

/** Versi Android dari user agent, atau null bila tidak ada. */
export function parseAndroidVersion(ua: string): string | null {
  return /Android (\d+(?:\.\d+)*)/.exec(ua)?.[1] ?? null;
}

/** Bilangan ringkas: bulat apa adanya, pecahan maksimal dua desimal tanpa nol di belakang. */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '–';
  return String(Math.round(n * 100) / 100);
}

export function formatInsets(i: Insets): string {
  return SIDES.map((s) => `${SIDE_LABEL[s]} ${formatNumber(i[s])}`).join(' · ') + ' px';
}

/** Rasio terhadap nilai acuan sebagai persen bulat, mis. 1.3 → "130%". */
export function formatRatio(ratio: number): string {
  return Number.isFinite(ratio) && ratio > 0 ? `${Math.round(ratio * 100)}%` : '–';
}

export function describeLite(mode: PerfMode, lowEnd: boolean): string {
  const active = resolveLite(mode, lowEnd);
  const source =
    mode === 'auto' ? `otomatis, ${lowEnd ? 'perangkat terdeteksi lemah' : 'perangkat tidak terdeteksi lemah'}` : 'diatur manual';
  return `${active ? 'Aktif' : 'Mati'} (${source})`;
}

/** Teks polos untuk disalin: satu baris "label: nilai" per entri. */
export function formatDiagnostics(entries: DiagnosticEntry[]): string {
  return entries.map((e) => `${e.label}: ${e.value}`).join('\n');
}

/* ───────── Pengukuran DOM ───────── */

const PROBE_PX = 100;

function withProbe<T>(style: Partial<CSSStyleDeclaration>, read: (el: HTMLElement) => T, text = ''): T {
  const el = document.createElement('span');
  Object.assign(el.style, { position: 'absolute', visibility: 'hidden', pointerEvents: 'none', left: '0', top: '0' }, style);
  el.textContent = text;
  document.body.appendChild(el);
  try {
    return read(el);
  } finally {
    el.remove();
  }
}

/** Sisipan hasil resolusi CSS: ekspresi dipasang sebagai padding probe lalu dibaca sebagai px. */
function measureInsets(expr: (side: (typeof SIDES)[number]) => string): Insets {
  return withProbe({ display: 'block' }, (el) => {
    for (const s of SIDES) el.style.setProperty(`padding-${s}`, expr(s));
    const cs = getComputedStyle(el);
    return {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    };
  });
}

/** Nilai mentah variabel --safe-area-inset-* yang disuntikkan lapisan native (kosong bila tidak ada). */
function nativeInsetVars(): string {
  const cs = getComputedStyle(document.documentElement);
  const vals = SIDES.map((s) => cs.getPropertyValue(`--safe-area-inset-${s}`).trim());
  if (vals.every((v) => !v)) return 'tidak disetel';
  return SIDES.map((s, k) => `${SIDE_LABEL[s]} ${vals[k] || '–'}`).join(' · ');
}

/**
 * Zoom teks efektif dari dua sisi: ukuran huruf terhitung (getComputedStyle) dibanding nilai CSS 100px,
 * dan lebar teks yang dirender dibanding lebar yang sama dari canvas (canvas tidak ikut zoom teks).
 */
function measureTextZoom(): { computed: number; rendered: number } {
  const sample = 'MMMMMMMMMM';
  const font = `${PROBE_PX}px sans-serif`;
  return withProbe(
    { font, lineHeight: '1', whiteSpace: 'nowrap' },
    (el) => {
      const computed = parseFloat(getComputedStyle(el).fontSize) / PROBE_PX;
      const ctx = document.createElement('canvas').getContext('2d');
      let rendered = NaN;
      if (ctx) {
        ctx.font = font;
        const ref = ctx.measureText(sample).width;
        if (ref > 0) rendered = el.getBoundingClientRect().width / ref;
      }
      return { computed, rendered };
    },
    sample,
  );
}

export function collectDiagnostics(opts: { appVersion: string; perfMode: PerfMode }): DiagnosticEntry[] {
  const ua = navigator.userAgent;
  const vv = window.visualViewport;
  const zoom = measureTextZoom();
  const varInsets = (s: string) => `var(--safe-${s}, 0px)`;
  const envInsets = (s: string) => `env(safe-area-inset-${s}, 0px)`;
  return [
    { label: 'Aplikasi', value: opts.appVersion },
    { label: 'Versi WebView', value: parseEngineVersion(ua) ?? 'tidak terdeteksi' },
    { label: 'Android', value: parseAndroidVersion(ua) ?? 'tidak terdeteksi' },
    { label: 'Jendela (innerWidth × innerHeight)', value: `${window.innerWidth} × ${window.innerHeight} px` },
    {
      label: 'Viewport visual',
      value: vv
        ? `${formatNumber(vv.width)} × ${formatNumber(vv.height)} px · skala ${formatNumber(vv.scale)}` +
          (vv.offsetTop ? ` · geser atas ${formatNumber(vv.offsetTop)} px` : '')
        : 'tidak didukung',
    },
    { label: 'Rasio piksel perangkat', value: formatNumber(window.devicePixelRatio) },
    { label: 'Area aman (--safe-*)', value: formatInsets(measureInsets(varInsets)) },
    { label: 'Area aman env()', value: formatInsets(measureInsets(envInsets)) },
    { label: 'Area aman native (--safe-area-inset-*)', value: nativeInsetVars() },
    { label: 'Zoom teks efektif', value: `${formatRatio(zoom.computed)} gaya terhitung · ${formatRatio(zoom.rendered)} lebar teks` },
    { label: 'Mode hemat', value: describeLite(opts.perfMode, isLowEndDevice()) },
  ];
}
