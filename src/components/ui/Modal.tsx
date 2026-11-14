import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from '../../lib/glyphs';
import { useLayer } from '../../lib/layers';

function useFocusTrap(active: boolean, root: React.RefObject<HTMLElement | null>, initial?: string) {
  useEffect(() => {
    if (!active) return;
    const prev = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => {
      const el = root.current;
      if (!el) return;
      const target =
        (initial && el.querySelector<HTMLElement>(initial)) ||
        el.querySelector<HTMLElement>('[data-autofocus]') ||
        el.querySelector<HTMLElement>('[data-field]') ||
        el.querySelector<HTMLElement>('button:not(.close-btn), input, textarea');
      target?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !root.current) return;
      const f = Array.from(
        root.current.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((x) => x.offsetParent !== null || x.getClientRects().length > 0);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      if (prev && document.contains(prev)) requestAnimationFrame(() => prev.focus({ preventScroll: true }));
    };
  }, [active, root, initial]);
}

function useDialogTopLayer(open: boolean) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);

  useLayoutEffect(() => {
    const d = dlg.current;
    if (!d || !open) return;
    if (!d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
      window.dispatchEvent(new CustomEvent('top-layer-open'));
    }
  }, [open, present]);

  const finishExit = () => {
    if (open) return;
    const d = dlg.current;
    if (d?.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
    setPresent(false);
  };

  return { dlg, present, finishExit };
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  initialFocus?: string;
  headerExtra?: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Nama dialog untuk pembaca layar bila tidak ada judul yang terlihat */
  ariaLabel?: string;
  role?: 'dialog' | 'alertdialog';
}

export function Modal({ open, onClose, title, subtitle, icon, children, footer, size = 'md', initialFocus, headerExtra, className = '', bodyClassName = '', ariaLabel, role = 'dialog' }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const backdropDown = useRef(false);
  const titleId = useId();
  const { dlg, present, finishExit } = useDialogTopLayer(open);
  useLayer(open, onClose);
  useFocusTrap(open, ref, initialFocus);

  if (!present) return null;

  const hasHead = !!(title || icon);

  return createPortal(
    <dialog
      ref={dlg}
      className="modal-dialog"
      role={role === 'alertdialog' ? 'alertdialog' : undefined}
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : ariaLabel}
      onCancel={(e) => {
        // Escape ditangani berlapis oleh useLayer (LIFO) agar popover di dalam dialog ditutup terlebih dahulu.
        e.preventDefault();
      }}
      onClose={() => {
        if (open) onClose();
      }}
    >
      <AnimatePresence onExitComplete={finishExit}>
        {open && (
          <>
            <motion.div
              key="backdrop"
              className="modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.18 } }}
              transition={{ duration: 0.2 }}
              onPointerDown={(e) => {
                backdropDown.current = e.target === e.currentTarget;
              }}
              onClick={(e) => {
                if (role !== 'alertdialog' && backdropDown.current && e.target === e.currentTarget) onClose();
                backdropDown.current = false;
              }}
            />
            <motion.div
              key="dialog"
              ref={ref}
              className={`modal ${size !== 'md' ? `modal-${size}` : ''} ${className}`}
              initial={{ opacity: 0, scale: 0.955, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 } }}
              exit={{ opacity: 0, scale: 0.97, y: 6, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } }}
            >
              {hasHead ? (
                <div className="modal-head">
                  {icon}
                  <div className="grow">
                    {title && (
                      <h2 className="modal-title" id={titleId}>
                        {title}
                      </h2>
                    )}
                    {subtitle && <div className="modal-sub">{subtitle}</div>}
                  </div>
                  {headerExtra}
                  <button type="button" className="close-btn" onClick={onClose} aria-label="Tutup">
                    <X />
                  </button>
                </div>
              ) : (
                role !== 'alertdialog' && (
                  <button type="button" className="close-btn modal-float-close" onClick={onClose} aria-label="Tutup">
                    <X />
                  </button>
                )
              )}
              <div className={`modal-body ${bodyClassName}`}>{children}</div>
              {footer && <div className="modal-foot">{footer}</div>}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </dialog>,
    document.body,
  );
}

export function Sheet({ open, onClose, children, width, ariaLabel }: { open: boolean; onClose: () => void; children: ReactNode; width?: number; ariaLabel?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const backdropDown = useRef(false);
  const { dlg, present, finishExit } = useDialogTopLayer(open);
  useLayer(open, onClose);
  useFocusTrap(open, ref);

  if (!present) return null;

  return createPortal(
    <dialog
      ref={dlg}
      className="sheet-dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onCancel={(e) => {
        e.preventDefault();
      }}
      onClose={() => {
        if (open) onClose();
      }}
    >
      <AnimatePresence onExitComplete={finishExit}>
        {open && (
          <>
            <motion.div
              key="backdrop"
              className="modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onPointerDown={(e) => {
                backdropDown.current = e.target === e.currentTarget;
              }}
              onClick={(e) => {
                if (backdropDown.current && e.target === e.currentTarget) onClose();
                backdropDown.current = false;
              }}
              style={{ background: 'color-mix(in srgb, var(--overlay) 55%, transparent)', backdropFilter: 'none' }}
            />
            <motion.div
              key="sheet"
              ref={ref}
              className="sheet"
              style={width ? { width: `min(${width}px, calc(100vw - 20px))` } : undefined}
              initial={{ opacity: 0, x: 48 }}
              animate={{ opacity: 1, x: 0, transition: { type: 'spring', stiffness: 380, damping: 36 } }}
              exit={{ opacity: 0, x: 36, transition: { duration: 0.18 } }}
            >
              {children}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </dialog>,
    document.body,
  );
}
