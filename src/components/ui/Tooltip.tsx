import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

export function Tooltip({
  label,
  kbd,
  side = 'bottom',
  delay = 450,
  disabled,
  children,
}: {
  label: ReactNode;
  kbd?: string[];
  side?: 'bottom' | 'top' | 'right';
  delay?: number;
  disabled?: boolean;
  children: ReactNode;
}) {
  const wrap = useRef<HTMLSpanElement>(null);
  const timer = useRef<number>(0);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const show = () => {
    if (disabled) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const el = (wrap.current?.firstElementChild as HTMLElement | null) ?? wrap.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (side === 'right') setPos({ x: r.right + 10, y: r.top + r.height / 2 });
      else if (side === 'top') setPos({ x: r.left + r.width / 2, y: r.top - 8 });
      else setPos({ x: r.left + r.width / 2, y: r.bottom + 8 });
    }, delay);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setPos(null);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (disabled) hide();
  }, [disabled]);

  const tx = side === 'right' ? '0%' : '-50%';
  const ty = side === 'right' ? '-50%' : side === 'top' ? '-100%' : '0%';

  return (
    <>
      <span
        ref={wrap}
        style={{ display: 'contents' }}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={(e) => {
          if ((e.target as HTMLElement).matches(':focus-visible')) show();
        }}
        onBlur={hide}
        onMouseDown={hide}
      >
        {children}
      </span>
      {createPortal(
        <AnimatePresence>
          {pos && (
            <motion.div
              className="tooltip"
              style={{ left: pos.x, top: pos.y, x: tx, y: ty }}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1, transition: { duration: 0.14, ease: [0.2, 0.8, 0.2, 1] } }}
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
            >
              <span>{label}</span>
              {kbd && (
                <span className="row" style={{ gap: 2 }}>
                  {kbd.map((k) => (
                    <span key={k} className="kbd">
                      {k}
                    </span>
                  ))}
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
