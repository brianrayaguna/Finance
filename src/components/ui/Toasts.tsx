import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CircleCheck, CircleAlert, Info, X } from '../../lib/glyphs';
import { useToasts, type Toast } from '../../store/ui';

function ToastItem({ t }: { t: Toast }) {
  const dismiss = useToasts((s) => s.dismiss);
  const persistent = t.tone === 'danger' || !!t.action || t.duration === Infinity;
  const [paused, setPaused] = useState(false);
  const remaining = useRef(t.duration ?? 3600);
  const started = useRef(Date.now());

  useEffect(() => {
    if (persistent || paused) return;
    started.current = Date.now();
    let raf = 0;
    const tick = () => {
      const left = remaining.current - (Date.now() - started.current);
      if (left <= 0) dismiss(t.id);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
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
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 460, damping: 32 } }}
      exit={{ opacity: 0, y: 12, scale: 0.97, transition: { duration: 0.16 } }}
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
    const promote = () => {
      try {
        if (el.matches(':popover-open')) el.hidePopover();
        if (toasts.length > 0) el.showPopover();
      } catch {
        /* abaikan bila browser belum mendukung */
      }
    };
    promote();
    window.addEventListener('top-layer-open', promote);
    return () => window.removeEventListener('top-layer-open', promote);
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
