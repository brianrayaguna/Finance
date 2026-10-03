import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronRight, type Glyph } from '../../lib/glyphs';
import { useLayer } from '../../lib/layers';

export type Anchor = RefObject<HTMLElement | null> | { x: number; y: number };

function anchorRect(a: Anchor): DOMRect {
  if ('current' in a) return a.current?.getBoundingClientRect() ?? new DOMRect();
  return new DOMRect(a.x, a.y, 0, 0);
}

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchor: Anchor;
  children: ReactNode;
  placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'right-start';
  width?: number | 'anchor';
  minWidth?: number;
  className?: string;
  offset?: number;
  style?: CSSProperties;
  closeOnOutside?: boolean;
  role?: string;
  /** Pindahkan fokus ke kontrol pertama saat dibuka dan kembalikan ke pemicu saat ditutup */
  autoFocus?: boolean;
}

export function Popover({
  open,
  onClose,
  anchor,
  children,
  placement = 'bottom-start',
  width,
  minWidth,
  className = '',
  offset = 6,
  style,
  closeOnOutside = true,
  role = 'dialog',
  autoFocus = false,
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; origin: string; w?: number } | null>(null);
  useLayer(open, onClose);

  const place = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = anchorRect(anchor);
    const w = width === 'anchor' ? r.width : typeof width === 'number' ? width : undefined;
    // Ukuran tata letak (offset*), bukan getBoundingClientRect: saat animasi masuk popover masih
    // diskalakan 0,96 sehingga lebarnya terukur lebih kecil dan popover di tepi kanan meluber.
    const pw = w ?? el.offsetWidth;
    const ph = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top: number;
    let left: number;
    let origin = 'top';
    if (placement === 'right-start') {
      // baris pertama anak menu sejajar dengan baris pemicunya (menu punya padding 5–6px)
      left = r.right + offset;
      top = r.top - 6;
      if (left + pw > vw - 8) left = r.left - offset - pw;
    } else {
      const below = r.bottom + offset;
      const above = r.top - offset - ph;
      const preferTop = placement.startsWith('top');
      top = preferTop ? above : below;
      if (!preferTop && below + ph > vh - 8 && above > 8) {
        top = above;
        origin = 'bottom';
      } else if (preferTop) {
        origin = 'bottom';
        if (above < 8) {
          top = below;
          origin = 'top';
        }
      }
      left = placement.endsWith('end') ? r.right - pw : r.left;
    }
    top = Math.max(8, Math.min(top, vh - ph - 8));
    left = Math.max(8, Math.min(left, vw - pw - 8));
    const next = { top, left, origin: `${origin} ${placement.endsWith('end') ? 'right' : 'left'}`, w };
    setPos((p) =>
      p && Math.abs(p.top - next.top) < 0.5 && Math.abs(p.left - next.left) < 0.5 && p.origin === next.origin && p.w === next.w ? p : next,
    );
  }, [anchor, placement, width, offset]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    place();
    const id = requestAnimationFrame(place);
    return () => cancelAnimationFrame(id);
  }, [open, place]);

  useEffect(() => {
    if (!open || !autoFocus) return;
    const t = requestAnimationFrame(() =>
      ref.current?.querySelector<HTMLElement>('button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')?.focus(),
    );
    return () => {
      cancelAnimationFrame(t);
      const a = document.activeElement;
      if ('current' in anchor && (!a || a === document.body || ref.current?.contains(a))) anchor.current?.focus();
    };
  }, [open, autoFocus, anchor]);

  useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      place();
    };
    const onDown = (e: MouseEvent) => {
      if (!closeOnOutside) return;
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if ('current' in anchor && anchor.current?.contains(t)) return;
      // klik di popover lain yang dibuka dari dalam popover ini (mis. daftar pilihan) bukan klik di luar
      if (t instanceof Element && t.closest('.popover')) return;
      onClose();
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('mousedown', onDown, true);
    const ro = ref.current ? new ResizeObserver(() => place()) : null;
    if (ro && ref.current) ro.observe(ref.current);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('mousedown', onDown, true);
      ro?.disconnect();
    };
  }, [open, place, anchor, onClose, closeOnOutside]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          role={role}
          className={`popover ${className}`}
          style={{
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            width: pos?.w,
            minWidth,
            transformOrigin: pos?.origin,
            visibility: pos ? 'visible' : 'hidden',
            ...style,
          }}
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 520, damping: 34, mass: 0.7 } }}
          exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ───────── Menu ───────── */

export interface MenuItem {
  label?: string;
  icon?: Glyph;
  kbd?: string;
  /** Teks redup rata kanan, mis. nomor versi */
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  separator?: boolean;
  heading?: string;
  /** Baris keterangan redup (bukan huruf kapital), mis. nama buku di kepala menu profil */
  note?: string;
  checked?: boolean;
  /** Anak menu yang terbuka ke samping (hover, → atau Enter) */
  submenu?: MenuItem[];
}

const isAction = (it: MenuItem) => !it.separator && !it.heading && !it.note && !it.disabled;

export function MenuList({
  items,
  onClose,
  onBack,
  popClassName,
}: {
  items: MenuItem[];
  onClose: () => void;
  onBack?: () => void;
  /** Kelas popover yang diteruskan ke anak menu agar gayanya sama dengan induknya */
  popClassName?: string;
}) {
  const actionable = items.map((it, i) => ({ it, i })).filter((x) => isAction(x.it));
  const [active, setActive] = useState(-1);
  const [sub, setSub] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const subAnchor = useRef<HTMLElement | null>(null);
  const hoverTimer = useRef(0);
  useEffect(() => {
    ref.current?.focus();
    return () => window.clearTimeout(hoverTimer.current);
  }, []);

  const openSub = (i: number) => {
    window.clearTimeout(hoverTimer.current);
    subAnchor.current = itemRefs.current[i];
    setActive(i);
    setSub(i);
  };
  const closeSub = useCallback(() => {
    setSub(null);
    requestAnimationFrame(() => ref.current?.focus());
  }, []);
  const choose = (it: MenuItem, i: number) => {
    if (it.disabled) return;
    if (it.submenu) return openSub(i);
    onClose();
    it.onSelect?.();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (sub !== null) return; // anak menu yang terbuka menangani tombolnya sendiri
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      if (!actionable.length) return;
      const idx = actionable.findIndex((x) => x.i === active);
      const n =
        e.key === 'Home' ? 0 : e.key === 'End' ? actionable.length - 1 : e.key === 'ArrowDown' ? (idx + 1) % actionable.length : (idx - 1 + actionable.length) % actionable.length;
      setActive(actionable[n]?.i ?? -1);
    } else if (e.key === 'ArrowRight' && items[active]?.submenu) {
      e.preventDefault();
      openSub(active);
    } else if (e.key === 'ArrowLeft' && onBack) {
      e.preventDefault();
      onBack();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const it = items[active];
      if (it && isAction(it)) choose(it, active);
    } else if (e.key === 'Tab') {
      onClose();
    }
  };

  return (
    <div className="menu" role="menu" tabIndex={-1} ref={ref} onKeyDown={onKey} style={{ outline: 'none' }}>
      {items.map((it, i) =>
        it.separator ? (
          <div key={i} className="menu-sep" role="separator" />
        ) : it.note ? (
          <div key={i} className="menu-note truncate">
            {it.note}
          </div>
        ) : it.heading ? (
          <div key={i} className="menu-label">
            {it.heading}
          </div>
        ) : (
          <button
            key={i}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            type="button"
            role={it.checked !== undefined ? 'menuitemradio' : 'menuitem'}
            aria-checked={it.checked !== undefined ? it.checked : undefined}
            aria-haspopup={it.submenu ? 'menu' : undefined}
            aria-expanded={it.submenu ? sub === i : undefined}
            disabled={it.disabled}
            className={`menu-item${it.danger ? ' danger' : ''}${active === i ? ' active' : ''}`}
            style={it.disabled ? { opacity: 0.4 } : undefined}
            onMouseEnter={() => {
              setActive(i);
              window.clearTimeout(hoverTimer.current);
              if (it.submenu) hoverTimer.current = window.setTimeout(() => openSub(i), 110);
              else if (sub !== null) setSub(null);
            }}
            onMouseLeave={() => {
              window.clearTimeout(hoverTimer.current);
              if (sub === null) setActive(-1);
            }}
            onClick={() => choose(it, i)}
          >
            {it.icon && <it.icon />}
            <span className="grow">{it.label}</span>
            {it.hint && <span className="menu-hint">{it.hint}</span>}
            {it.checked && <Check className="menu-check" aria-hidden />}
            {it.kbd && <span className="kbd">{it.kbd}</span>}
            {it.submenu && <ChevronRight className="menu-sub-chev" aria-hidden />}
          </button>
        ),
      )}
      {sub !== null && items[sub]?.submenu && (
        <Popover open onClose={closeSub} anchor={subAnchor} placement="right-start" offset={6} minWidth={200} role="none" className={popClassName}>
          <MenuList
            items={items[sub].submenu!}
            onClose={() => {
              setSub(null);
              onClose();
            }}
            onBack={closeSub}
            popClassName={popClassName}
          />
        </Popover>
      )}
    </div>
  );
}

export function Menu({
  trigger,
  items,
  placement = 'bottom-end',
  minWidth = 210,
  className,
}: {
  trigger: (props: { ref: RefObject<HTMLButtonElement | null>; onClick: (e: React.MouseEvent) => void; 'aria-expanded': boolean }) => ReactNode;
  items: MenuItem[];
  placement?: PopoverProps['placement'];
  minWidth?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      {trigger({
        ref,
        onClick: (e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        },
        'aria-expanded': open,
      })}
      <Popover open={open} onClose={close} anchor={ref} placement={placement} minWidth={minWidth} role="none" className={className}>
        <MenuList items={items} onClose={close} popClassName={className} />
      </Popover>
    </>
  );
}

/** Menu konteks (klik kanan) */
export function useContextMenu() {
  const [state, setState] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const close = useCallback(() => setState(null), []);
  const open = useCallback((e: React.MouseEvent, items: MenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setState({ x: e.clientX, y: e.clientY, items });
  }, []);
  const anchor = useMemo(() => (state ? { x: state.x, y: state.y } : { x: 0, y: 0 }), [state]);
  const node = (
    <Popover open={!!state} onClose={close} anchor={anchor} offset={2} minWidth={210} role="none">
      {state && <MenuList items={state.items} onClose={close} />}
    </Popover>
  );
  return { open, close, node };
}
