import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m as motion } from 'framer-motion';
import { CircleCheck, CircleAlert, Info, X } from '../../lib/glyphs';
import { useToasts, type Toast } from '../../store/ui';

function ToastItem({ t }: { t: Toast }) {
  const dismiss = useToasts((s) => s.dismiss);
  // Hanya menempel bila eksplisit Infinity, atau danger tanpa duration.
  const persistent = t.duration === Infinity || (t.tone === 'danger' && t.duration === undefined);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(t.duration ?? (t.tone === 'danger' ? Infinity : 4200));
  const started = useRef(Date.now());

  useEffect(() => {
    if (persistent || paused) return;
    started.current = Date.now();
    const wait = Math.max(0, remaining.current);
    const id = window.setTimeout(() => dismiss(t.id), wait);
    return () => {
      window.clearTimeout(id);
      remaining.current -= Date.now() - started.current;
    };
  }, [persistent, paused, t.id, t.duration, dismiss]);

  const Icon = t.tone === 'danger' ? CircleAlert : t.tone === 'info' ? Info : t.tone === 'success' ? CircleCheck : null;

  return (
    <motion.div
      layout
      className="toast"
      role={t.tone === 'danger' ? 'alert' : 'status'}
      aria-live={t.tone === 'danger' ? 'assertive' : 'polite'}
      aria-atomic="true"
      // Masuk: CSS `toast-in` (compositor). framer hanya untuk geser tumpukan (layout) & memudar keluar.
      exit={{ opacity: 0, transition: { duration: 0.16 } }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
      style={{ position: 'relative' }}
    >
      {Icon && <Icon className={`t-icon ${t.tone}`} />}
      <span className="grow" style={{ paddingRight: 4 }}>
        {t.message}
        {t.detail && <span className="t-detail">{t.detail}</span>}
      </span>
      {t.action && (
        <button
          type="button"
          className="t-action"
          onClick={() => {
            dismiss(t.id);
            t.action!.run();
          }}
        >
          {t.action.label}
        </button>
      )}
      <button type="button" className="t-close" aria-label="Tutup" onClick={() => dismiss(t.id)}>
        <X />
      </button>
    </motion.div>
  );
}

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const stackRef = useRef<HTMLDivElement>(null);
  const toastKeys = toasts.map((t) => t.id).join(',');

  useLayoutEffect(() => {
    const el = stackRef.current;
    if (!el || typeof el.showPopover !== 'function') return;
    let hideTimer = 0;
    const promote = () => {
      window.clearTimeout(hideTimer);
      try {
        if (toasts.length > 0) {
          if (el.matches(':popover-open')) el.hidePopover();
          el.showPopover();
        } else if (el.matches(':popover-open')) {
          // Tunggu animasi keluar toast (160ms) selesai sebelum menutup top-layer.
          hideTimer = window.setTimeout(() => {
            try {
              if (el.matches(':popover-open')) el.hidePopover();
            } catch {
              /* abaikan */
            }
          }, 200);
        }
      } catch {
        /* abaikan bila browser belum mendukung */
      }
    };
    promote();
    window.addEventListener('top-layer-open', promote);
    return () => {
      window.clearTimeout(hideTimer);
      window.removeEventListener('top-layer-open', promote);
    };
  }, [toastKeys, toasts.length]);

  return createPortal(
    <div ref={stackRef} popover="manual" className="toast-stack">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastItem key={t.id} t={t} />
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
