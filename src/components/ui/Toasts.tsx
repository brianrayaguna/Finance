import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CircleCheck, CircleAlert, Info, X } from 'lucide-react';
import { useToasts, type Toast } from '../../store/ui';

function ToastItem({ t }: { t: Toast }) {
  const dismiss = useToasts((s) => s.dismiss);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(t.duration ?? 3600);
  const started = useRef(Date.now());
  const [progress, setProgress] = useState(1);

  useEffect(() => {
    if (paused) return;
    started.current = Date.now();
    const total = t.duration ?? 3600;
    let raf = 0;
    const tick = () => {
      const left = remaining.current - (Date.now() - started.current);
      setProgress(Math.max(0, left / total));
      if (left <= 0) dismiss(t.id);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      remaining.current -= Date.now() - started.current;
    };
  }, [paused, t.id, t.duration, dismiss]);

  const Icon = t.tone === 'danger' ? CircleAlert : t.tone === 'info' ? Info : t.tone === 'success' ? CircleCheck : null;

  return (
    <motion.div
      layout
      className="toast"
      role="status"
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 460, damping: 32 } }}
      exit={{ opacity: 0, y: 12, scale: 0.97, transition: { duration: 0.16 } }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
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
      {t.action && (
        <span className="t-bar">
          <span style={{ display: 'block', height: '100%', width: `${progress * 100}%`, background: 'rgba(255,255,255,.45)', borderRadius: 2 }} />
        </span>
      )}
    </motion.div>
  );
}

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  return createPortal(
    <div className="toast-stack" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastItem key={t.id} t={t} />
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
