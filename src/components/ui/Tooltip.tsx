import { cloneElement, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m as motion } from 'framer-motion';
import { useTransformFrom } from '../../lib/motion';

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
  const tf = useTransformFrom();
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number>(0);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);

  const show = () => {
    if (disabled) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const el = (wrap.current?.firstElementChild as HTMLElement | null) ?? wrap.current;
      if (!el) return;
      setAnchor(el.getBoundingClientRect());
    }, delay);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setAnchor(null);
    setCoords(null);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (disabled) hide();
  }, [disabled]);

  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    const onScroll = () => hide();
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [anchor]);

  useLayoutEffect(() => {
    if (!anchor) return;
    const el = tipRef.current;
    if (!el) return;
    if (typeof el.showPopover === 'function' && !el.matches(':popover-open')) {
      try {
        el.showPopover();
      } catch {
        /* abaikan bila belum siap */
      }
    }
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left: number;
    let top: number;
    if (side === 'right') {
      left = anchor.right + 10;
      if (left + w > vw - 8 && anchor.left - 10 - w >= 8) left = anchor.left - 10 - w;
      top = anchor.top + anchor.height / 2 - h / 2;
    } else {
      left = anchor.left + anchor.width / 2 - w / 2;
      const below = anchor.bottom + 8;
      const above = anchor.top - 8 - h;
      top = side === 'top' ? (above >= 8 ? above : below) : below + h <= vh - 8 || above < 8 ? below : above;
    }
    left = Math.max(8, Math.min(left, vw - w - 8));
    top = Math.max(8, Math.min(top, vh - h - 8));
    setCoords((c) => (c && Math.abs(c.left - left) < 0.5 && Math.abs(c.top - top) < 0.5 ? c : { left, top }));
  }, [anchor, side, label, kbd]);

  const triggerNode = isValidElement(children)
    ? cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        'aria-describedby':
          [
            (children.props as Record<string, unknown>)['aria-describedby'] as string | undefined,
            anchor ? id : undefined,
          ]
            .filter(Boolean)
            .join(' ') || undefined,
      })
    : children;

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
        {triggerNode}
      </span>
      {createPortal(
        <AnimatePresence>
          {anchor && (
            <motion.div
              ref={tipRef}
              id={id}
              role="tooltip"
              popover="manual"
              className="tooltip"
              style={{
                left: coords?.left ?? -9999,
                top: coords?.top ?? -9999,
                visibility: coords ? 'visible' : 'hidden',
              }}
              initial={{ opacity: 0, transform: tf('scale(0.94)', 'scale(1)') }}
              animate={{ opacity: 1, transform: 'scale(1)', transition: { duration: 0.14, ease: [0.2, 0.8, 0.2, 1] } }}
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
            >
              <span>{label}</span>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
