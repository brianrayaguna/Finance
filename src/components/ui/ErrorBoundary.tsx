import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Download, RotateCcw, TriangleAlert } from '../../lib/glyphs';
import { Button, IconTile } from './primitives';

function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Mengunduh cadangan langsung dari localStorage agar tetap berfungsi walau store/UI sedang bermasalah. */
function exportEmergencyBackup() {
  try {
    const rawData = localStorage.getItem('neraca.data');
    const rawPrefs = localStorage.getItem('neraca.prefs');
    const parsedData = rawData ? JSON.parse(rawData) : null;
    const parsedPrefs = rawPrefs ? JSON.parse(rawPrefs) : null;
    const payload = {
      app: 'keuanganku',
      version: 3,
      emergencyBackup: true,
      exportedAt: new Date().toISOString(),
      data: parsedData?.state?.data ?? parsedData,
      prefs: parsedPrefs?.state ?? parsedPrefs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `keuanganku-cadangan-darurat-${todayStamp()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (err) {
    console.error('Emergency backup failed:', err);
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
          <p className="muted error-desc">Data transaksi dan pengaturan Anda tetap tersimpan aman di browser ini. Anda bisa mencoba lagi, memuat ulang aplikasi, atau mengunduh cadangan JSON terlebih dahulu.</p>
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
