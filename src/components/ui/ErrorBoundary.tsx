import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Download, RotateCcw, TriangleAlert } from '../../lib/glyphs';
import { Button, IconTile } from './primitives';
import { flushDataStorage } from '../../store/data';
import { isNativeApp, saveFile } from '../../lib/saveFile';

function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Mengunduh cadangan langsung dari localStorage agar tetap berfungsi walau store/UI sedang bermasalah. */
function exportEmergencyBackup() {
  try {
    // Perubahan terakhir mungkin masih tertunda (penulisan ditunda); tulis dulu sebelum dibaca.
    try {
      flushDataStorage();
    } catch {
      /* tetap lanjut dengan isi localStorage yang ada */
    }
    const rawData = localStorage.getItem('neraca.data');
    const rawPrefs = localStorage.getItem('neraca.prefs');
    if (!rawData && !rawPrefs) {
      window.alert('Tidak ada data tersimpan yang dapat dicadangkan.');
      return;
    }
    const safeParse = (raw: string | null): { parsed: Record<string, unknown> | null; rawFallback?: string } => {
      if (!raw) return { parsed: null };
      try {
        return { parsed: JSON.parse(raw) as Record<string, unknown> };
      } catch {
        return { parsed: null, rawFallback: raw };
      }
    };
    const d = safeParse(rawData);
    const p = safeParse(rawPrefs);
    const payload = {
      app: 'keuanganku',
      version: 3,
      emergencyBackup: true,
      exportedAt: new Date().toISOString(),
      data: (d.parsed?.state as Record<string, unknown> | undefined)?.data ?? d.parsed,
      prefs: (p.parsed?.state as Record<string, unknown> | undefined) ?? p.parsed,
      ...(d.rawFallback ? { rawDataCorrupt: d.rawFallback } : {}),
      ...(p.rawFallback ? { rawPrefsCorrupt: p.rawFallback } : {}),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    // Layar gangguan utama tidak menampilkan toast: lokasi diberitahukan lewat dialog sistem.
    void saveFile({ kind: 'backup', name: `keuanganku-cadangan-darurat-${todayStamp()}.json`, mime: 'application/json', blob, quiet: true })
      .then((path) => {
        if (!path) window.alert('Cadangan darurat gagal disimpan.');
        else if (isNativeApp()) window.alert(`Cadangan darurat disimpan di:\n${path}`);
      })
      .catch((err) => {
        console.error('Emergency backup save failed:', err);
        window.alert('Cadangan darurat gagal disimpan.');
      });
  } catch (err) {
    console.error('Emergency backup failed:', err);
    window.alert('Cadangan darurat gagal dibuat.');
  }
}

interface Props {
  children: ReactNode;
  resetKey?: string;
  variant?: 'page' | 'root';
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Aplikasi mengalami galat tak terduga:', error, info);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const isRoot = this.props.variant === 'root';
    const Heading = isRoot ? 'h1' : 'h2';
    return (
      <div className={`error-fallback${isRoot ? ' root' : ''}`} role="alert">
        <div className="card error-card">
          <IconTile icon={TriangleAlert} size="lg" color="var(--neg)" />
          <Heading className="error-title">Terjadi gangguan saat menampilkan halaman</Heading>
          <p className="muted error-desc">Data transaksi dan pengaturan Anda tetap tersimpan aman di perangkat ini. Anda bisa mencoba lagi, memuat ulang aplikasi, atau mengunduh cadangan JSON terlebih dahulu.</p>
          {error.message && (
            <details className="error-details">
              <summary>Rincian teknis</summary>
              <code>{error.message}</code>
            </details>
          )}
          <div className="row error-actions" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button variant="primary" icon={RotateCcw} onClick={() => this.setState({ error: null })}>
              Coba lagi
            </Button>
            <Button onClick={() => window.location.reload()}>Muat ulang</Button>
            <Button variant="ghost" icon={Download} onClick={exportEmergencyBackup}>
              Unduh cadangan JSON
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
