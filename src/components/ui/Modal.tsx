import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useLayer } from '../../lib/layers';

function useFocusTrap(active: boolean, root: React.RefObject<HTMLElement | null>, initial?: string) {
  useEffect(() => {
    if (!active) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      const el = root.current;
      if (!el) return;
      const target =
        (initial && el.querySelector<HTMLElement>(initial)) ||
        el.querySelector<HTMLElement>('[data-autofocus]') ||
        el.querySelector<HTMLElement>('[data-field]') ||
        el.querySelector<HTMLElement>('button:not(.close-btn), input, textarea');
      target?.focus();
    }, 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !root.current) return;
      const f = Array.from(
        root.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea, [tabindex="0"], a[href]'),
      ).filter((x) => x.offsetParent !== null);
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
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      if (prev && document.contains(prev)) requestAnimationFrame(() => prev.focus({ preventScroll: true }));
    };
  }, [active, root, initial]);
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
  const titleId = useId();
  useLayer(open, onClose);
  useFocusTrap(open, ref, initialFocus);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="modal-root" role="presentation">
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.18 } }}
            transition={{ duration: 0.2 }}
            onMouseDown={onClose}
          />
          <motion.div
            ref={ref}
            role={role}
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-label={title ? undefined : ariaLabel}
            className={`modal ${size !== 'md' ? `modal-${size}` : ''} ${className}`}
            initial={{ opacity: 0, scale: 0.955, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 } }}
            exit={{ opacity: 0, scale: 0.97, y: 6, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } }}
          >
            {(title || icon) && (
              <div className="modal-head">
                {icon}
                <div className="grow">
                  {title && (
                    <div className="modal-title" id={titleId}>
                      {title}
                    </div>
                  )}
                  {subtitle && <div className="modal-sub">{subtitle}</div>}
                </div>
                {headerExtra}
                <button type="button" className="close-btn" onClick={onClose} aria-label="Tutup">
                  <X />
                </button>
              </div>
            )}
            <div className={`modal-body ${bodyClassName}`}>{children}</div>
            {footer && <div className="modal-foot">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function Sheet({ open, onClose, children, width, ariaLabel }: { open: boolean; onClose: () => void; children: ReactNode; width?: number; ariaLabel?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayer(open, onClose);
  useFocusTrap(open, ref);
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="sheet-root">
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onMouseDown={onClose}
            style={{ background: 'color-mix(in srgb, var(--overlay) 55%, transparent)', backdropFilter: 'none' }}
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            className="sheet"
            style={width ? { width: `min(${width}px, calc(100vw - 20px))` } : undefined}
            initial={{ opacity: 0, x: 48 }}
            animate={{ opacity: 1, x: 0, transition: { type: 'spring', stiffness: 380, damping: 36 } }}
            exit={{ opacity: 0, x: 36, transition: { duration: 0.18 } }}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
