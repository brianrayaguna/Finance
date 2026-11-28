import { useEffect, useState } from 'react';
import { Copy } from '../../lib/glyphs';
import { collectDiagnostics, formatDiagnostics, type DiagnosticEntry } from '../../lib/diagnostics';
import { toast, usePrefs } from '../../store/ui';
import { Button } from '../ui/primitives';

/**
 * Cadangan bila Clipboard API ditolak (sebagian WebView tidak memberi izin clipboard-write):
 * salin lewat textarea sementara selagi aktivasi pengguna dari klik masih berlaku.
 */
function copyWithSelection(text: string): boolean {
  const prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  Object.assign(area.style, { position: 'fixed', top: '0', left: '0', opacity: '0', pointerEvents: 'none' });
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
    prevFocus?.focus({ preventScroll: true });
  }
}

/**
 * Ringkasan runtime WebView (khusus APK) untuk membandingkan tampilan di HP dengan versi web.
 * Nilai dihitung ulang saat ukuran jendela atau viewport visual berubah (rotasi, keyboard, zoom).
 */
export function DiagnosticsPanel({ appVersion }: { appVersion: string }) {
  const perfMode = usePrefs((s) => s.perfMode);
  // Diisi setelah mount: pengukuran memasang elemen probe ke DOM, jadi tidak dijalankan saat render.
  const [entries, setEntries] = useState<DiagnosticEntry[]>([]);

  useEffect(() => {
    let frame = 0;
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setEntries(collectDiagnostics({ appVersion, perfMode })));
    };
    refresh();
    const vv = window.visualViewport;
    window.addEventListener('resize', refresh);
    vv?.addEventListener('resize', refresh);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', refresh);
      vv?.removeEventListener('resize', refresh);
    };
  }, [appVersion, perfMode]);

  const copy = () => {
    const text = formatDiagnostics(entries);
    const done = (ok: boolean) =>
      ok
        ? toast('Diagnostik disalin', { tone: 'success' })
        : toast('Gagal menyalin', { tone: 'danger', detail: 'Tekan lama daftar untuk memilih teks secara manual.' });
    if (!navigator.clipboard) {
      done(copyWithSelection(text));
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => done(true),
      () => done(copyWithSelection(text)),
    );
  };

  return (
    <div className="kv-panel">
      <div className="kv-panel-head">
        <span className="grow">
          <strong>Diagnostik tampilan</strong>
          <span className="kv-panel-sub">Lampirkan saat melaporkan tampilan yang berbeda dari versi web.</span>
        </span>
        <Button size="sm" icon={Copy} onClick={copy}>
          Salin
        </Button>
      </div>
      <dl className="kv-list">
        {entries.map((e) => (
          <div key={e.label} className="kv-item">
            <dt>{e.label}</dt>
            <dd>{e.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
