import { useRef } from 'react';
import { TriangleAlert, CircleHelp } from '../../lib/glyphs';
import { useConfirm, type ConfirmOpts } from '../../store/ui';
import { Modal } from './Modal';
import { Button, IconTile } from './primitives';

export function ConfirmHost() {
  const c = useConfirm((s) => s.current);
  const close = useConfirm((s) => s.close);
  // Simpan konten terakhir agar dialog tidak berkedip kosong selama animasi keluar 200ms.
  const last = useRef<ConfirmOpts | null>(null);
  if (c) last.current = c;
  const shown = c ?? last.current;
  const danger = shown?.tone === 'danger';
  return (
    <Modal
      open={!!c}
      onClose={() => close(false)}
      size="sm"
      initialFocus={danger ? '[data-cancel]' : '[data-confirm]'}
      role="alertdialog"
      ariaLabel={shown?.title}
    >
      {shown && (
        <div
          className="confirm"
          onKeyDown={(e) => {
            // Tindakan berbahaya tidak boleh dikonfirmasi dengan Enter sembarangan.
            if (!danger && e.key === 'Enter' && !(e.target as HTMLElement).closest('button')) {
              e.preventDefault();
              close(true);
            }
          }}
        >
          <IconTile icon={danger ? TriangleAlert : CircleHelp} color={danger ? 'var(--neg)' : 'var(--accent-ink)'} size="lg" />
          <div className="confirm-title">{shown.title}</div>
          {shown.message && <div className="confirm-msg">{shown.message}</div>}
          <div className="confirm-actions">
            <Button data-cancel onClick={() => close(false)} block>
              {shown.cancelLabel ?? 'Batal'}
            </Button>
            <Button variant={danger ? 'danger' : 'primary'} data-confirm onClick={() => close(true)} block>
              {shown.confirmLabel ?? 'Lanjutkan'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
