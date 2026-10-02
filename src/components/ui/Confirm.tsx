import { TriangleAlert, CircleHelp } from 'lucide-react';
import { useConfirm } from '../../store/ui';
import { Modal } from './Modal';
import { Button, IconTile } from './primitives';

export function ConfirmHost() {
  const c = useConfirm((s) => s.current);
  const close = useConfirm((s) => s.close);
  const danger = c?.tone === 'danger';
  return (
    <Modal open={!!c} onClose={() => close(false)} size="sm" initialFocus="[data-confirm]" role="alertdialog" ariaLabel={c?.title}>
      {c && (
        <div
          className="confirm"
          onKeyDown={(e) => {
            // Enter pada tombol yang sedang difokus (mis. "Batal") dijalankan oleh tombol itu sendiri —
            // jangan dipaksa menjadi "konfirmasi", terlebih untuk tindakan berbahaya.
            if (e.key === 'Enter' && !(e.target as HTMLElement).closest('button')) {
              e.preventDefault();
              close(true);
            }
          }}
        >
          <IconTile icon={danger ? TriangleAlert : CircleHelp} color={danger ? 'var(--neg)' : 'var(--accent)'} size="lg" />
          <div className="confirm-title">{c.title}</div>
          {c.message && <div className="confirm-msg">{c.message}</div>}
          <div className="confirm-actions">
            <Button onClick={() => close(false)} block>
              {c.cancelLabel ?? 'Batal'}
            </Button>
            <Button variant={danger ? 'danger' : 'primary'} data-confirm onClick={() => close(true)} block>
              {c.confirmLabel ?? 'Lanjutkan'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
