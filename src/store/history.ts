import { useData } from './data';
import { toast, useToasts } from './ui';
import { modKey } from '../lib/layers';

const clearUndoToasts = () =>
  useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.action?.label !== 'Urungkan' && t.action?.label !== 'Ulangi') }));

export function undo() {
  clearUndoToasts();
  const label = useData.getState().undo();
  if (label) toast(`Diurungkan: ${label}`, { tone: 'info', action: { label: 'Ulangi', run: redo }, duration: 4000 });
  else toast('Tidak ada tindakan untuk diurungkan', { duration: 2200 });
}

export function redo() {
  clearUndoToasts();
  const label = useData.getState().redo();
  if (label) toast(`Diulangi: ${label}`, { tone: 'info', action: { label: 'Urungkan', run: undo }, duration: 4000 });
  else toast('Tidak ada tindakan untuk diulangi', { duration: 2200 });
}

/**
 * Toast dengan tombol Urungkan yang hanya membatalkan tindakan terkait.
 * historyId kosong ('') berarti perubahan ditolak (periode terkunci) — pesan penolakan sudah tampil,
 * jadi pesan sukses tidak ditampilkan.
 */
export function notify(message: string, historyId: string | null | undefined, opts: { detail?: string; tone?: 'success' | 'danger' | 'default' } = {}) {
  if (historyId === '') return;
  toast(message, {
    tone: opts.tone ?? 'success',
    detail: opts.detail,
    duration: 5200,
    action: historyId
      ? {
          label: 'Urungkan',
          run: () => {
            if (useData.getState().canUndoId(historyId)) undo();
            else toast(`Tindakan ini sudah tidak dapat diurungkan dari sini — gunakan ${modKey('Z')}`, { duration: 3200 });
          },
        }
      : undefined,
  });
}
