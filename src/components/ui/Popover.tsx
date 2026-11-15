import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronRight, type Glyph } from '../../lib/glyphs';
import { useLayer } from '../../lib/layers';

const ParentPopoverCtx = createContext<string | null>(null);

function isDescendantPopover(target: EventTarget | null, ancestorId: string): boolean {
  let cur = target instanceof Element ? target.closest('[data-popover-id]') : null;
  while (cur) {
    const parent = cur.getAttribute('data-parent-popover');
    if (!parent) return false;
    if (parent === ancestorId) return true;
    cur = document.querySelector(`[data-popover-id="${CSS.escape(parent)}"]`);
  }
  return false;
}

export type Anchor = RefObject<HTMLElement | null> | { x: number; y: number };

function anchorRect(a: Anchor): DOMRect {
  if ('current' in a) return a.current?.getBoundingClientRect() ?? new DOMRect();
  return new DOMRect(a.x, a.y, 0, 0);
}

/** Dialog terbuka paling atas — supaya Select di dalam modal tetap bisa disentuh di mobile. */
function openDialogHost(): HTMLElement {
  const open = document.querySelectorAll<HTMLElement>('dialog[open]');
  return open[open.length - 1] ?? document.body;
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
  ariaLabel?: string;
  /** Pindahkan fokus ke kontrol pertama saat dibuka */
  autoFocus?: boolean;
  /** Kembalikan fokus ke pemicu saat popover ditutup */
  returnFocus?: boolean;
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
  ariaLabel,
  autoFocus = false,
  returnFocus = true,
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const popId = useId();
  const parentId = useContext(ParentPopoverCtx);
  const [pos, setPos] = useState<{ top: number; left: number; origin: string; w?: number; maxH: number } | null>(null);
  // Host dialog disimpan di ref agar portal tidak mount dulu ke body lalu pindah (remount mematahkan touch di mobile).
  const hostRef = useRef<HTMLElement | null>(null);
  const openedAt = useRef(0);
  const [, setHostTick] = useState(0);
  useLayer(open, onClose);

  if (open && typeof document !== 'undefined') {
    const next = openDialogHost();
    if (hostRef.current !== next) {
      hostRef.current = next;
    }
  }

  useLayoutEffect(() => {
    if (!open) return;
    openedAt.current = performance.now();
    const next = openDialogHost();
    if (hostRef.current !== next) {
      hostRef.current = next;
      setHostTick((n) => n + 1);
    }
  }, [open]);

  const place = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof el.showPopover === 'function' && !el.matches(':popover-open')) {
      try {
        el.showPopover();
      } catch {
        /* abaikan bila belum terhubung */
      }
    }
    const r = anchorRect(anchor);
    const rawW = width === 'anchor' ? r.width : typeof width === 'number' ? width : undefined;
    const w = rawW !== undefined && minWidth !== undefined ? Math.max(rawW, minWidth) : rawW;
    // Ukuran tata letak (offset*), bukan getBoundingClientRect: saat animasi masuk popover masih
    // diskalakan 0,96 sehingga lebarnya terukur lebih kecil dan popover di tepi kanan meluber.
    const pw = Math.max(w ?? el.offsetWidth, minWidth ?? 0);
    const gap = 8;
    const vv = window.visualViewport;
    const vw = vv?.width ?? window.innerWidth;
    const vh = vv?.height ?? window.innerHeight;
    const vx = vv?.offsetLeft ?? 0;
    const vy = vv?.offsetTop ?? 0;
    const viewTop = vy + gap;
    const viewBottom = vy + vh - gap;
    const viewLeft = vx + gap;
    const viewRight = vx + vw - gap;

    let top = 0;
    let left = 0;
    let origin = 'top';
    let originX = placement.endsWith('end') ? 'right' : 'left';
    let maxH = 120;
    let placeBelow = true;
    if (placement === 'right-start') {
      // baris pertama anak menu sejajar dengan baris pemicunya (menu punya padding 5–6px)
      left = r.right + offset;
      top = r.top - 6;
      originX = 'left';
      if (left + pw > viewRight) {
        const altLeft = r.left - offset - pw;
        if (altLeft >= viewLeft) {
          left = altLeft;
          originX = 'right';
        } else {
          // Layar sempit: tempatkan di bawah baris pemicu sedikit menjorok agar tidak menimpa induknya.
          left = Math.min(r.left + 12, viewRight - pw);
          top = r.bottom + 4;
          originX = 'left';
          origin = 'top';
        }
      }
      maxH = Math.max(120, viewBottom - Math.max(top, viewTop));
    } else {
      const spaceBelow = Math.max(0, viewBottom - (r.bottom + offset));
      const spaceAbove = Math.max(0, r.top - offset - viewTop);
      const preferTop = placement.startsWith('top');
      const minUseful = 160;
      // Pilih sisi yang muat; jika keduanya sempit, ambil yang lebih lapang.
      placeBelow = !preferTop;
      if (preferTop) {
        placeBelow = spaceAbove < minUseful && spaceBelow > spaceAbove;
      } else if (spaceBelow < minUseful && spaceAbove > spaceBelow) {
        placeBelow = false;
      }
      maxH = Math.max(120, placeBelow ? spaceBelow : spaceAbove);
      origin = placeBelow ? 'top' : 'bottom';
      left = placement.endsWith('end') ? r.right - pw : r.left;
    }

    const applyMaxH = (h: number) => {
      if (Math.abs((parseFloat(el.style.maxHeight) || 0) - h) > 0.5) el.style.maxHeight = `${h}px`;
    };
    applyMaxH(maxH);
    let ph = el.offsetHeight;
    if (placement !== 'right-start') {
      top = placeBelow ? r.bottom + offset : r.top - offset - ph;
    }
    // Klem ke viewport, lalu ketatkan maxHeight ke sisa ruang aktual (bawah atau atas).
    if (placeBelow || placement === 'right-start') {
      top = Math.max(viewTop, Math.min(top, viewBottom - Math.min(ph, maxH)));
      maxH = Math.max(120, Math.min(maxH, viewBottom - top));
      applyMaxH(maxH);
    } else {
      const anchorTop = r.top - offset;
      top = Math.max(viewTop, Math.min(top, anchorTop - 120));
      maxH = Math.max(120, Math.min(maxH, anchorTop - top));
      applyMaxH(maxH);
      ph = el.offsetHeight;
      top = Math.max(viewTop, anchorTop - ph);
    }
    left = Math.max(viewLeft, Math.min(left, viewRight - pw));
    const next = { top, left, origin: `${origin} ${originX}`, w, maxH };
    setPos((p) =>
      p &&
      Math.abs(p.top - next.top) < 0.5 &&
      Math.abs(p.left - next.left) < 0.5 &&
      p.origin === next.origin &&
      p.w === next.w &&
      Math.abs(p.maxH - next.maxH) < 0.5
        ? p
        : next,
    );
  }, [anchor, placement, width, minWidth, offset]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      if (ref.current) ref.current.style.maxHeight = '';
      return;
    }
    place();
    const id = requestAnimationFrame(place);
    return () => cancelAnimationFrame(id);
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    let t = 0;
    if (autoFocus) {
      t = requestAnimationFrame(() =>
        ref.current?.querySelector<HTMLElement>('button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')?.focus(),
      );
    }
    return () => {
      if (t) cancelAnimationFrame(t);
      if (!returnFocus) return;
      const a = document.activeElement;
      if ('current' in anchor && anchor.current?.isConnected && (!a || a === document.body || ref.current?.contains(a))) {
        anchor.current.focus();
      }
    };
  }, [open, autoFocus, returnFocus, anchor]);

  useEffect(() => {
    if (!open) return;
    const isInside = (t: EventTarget | null) => {
      if (!(t instanceof Node)) return false;
      if (ref.current?.contains(t)) return true;
      if ('current' in anchor && anchor.current?.contains(t)) return true;
      if (t instanceof Element && t.closest(`[data-popover-id="${CSS.escape(popId)}"]`)) return true;
      if (isDescendantPopover(t, popId)) return true;
      return false;
    };
    // Scroll di luar → tutup (jangan place()/mengejar trigger). Scroll di dalam panel atau anak → biarkan.
    const onScroll = (e: Event) => {
      if (performance.now() - openedAt.current < 320) return;
      const t = e.target;
      if (t instanceof Node && (ref.current?.contains(t) || isDescendantPopover(t, popId))) return;
      onClose();
    };
    // Tap luar menutup; pan luar yang memicu scroll host ditutup lewat onScroll di atas.
    const TAP_SLOP = 10;
    let down: { x: number; y: number; id: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (!closeOnOutside) return;
      if (isInside(e.target)) {
        down = null;
        return;
      }
      down = { x: e.clientX, y: e.clientY, id: e.pointerId };
    };
    const onUp = (e: PointerEvent) => {
      if (!closeOnOutside) return;
      const start = down && down.id === e.pointerId ? down : null;
      down = null;
      if (!start) return;
      if (performance.now() - openedAt.current < 320) return;
      if (isInside(e.target)) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (dx * dx + dy * dy > TAP_SLOP * TAP_SLOP) return;
      onClose();
    };
    const vv = window.visualViewport;
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    vv?.addEventListener('resize', place);
    // vv scroll (keyboard/chrome) cukup reposisi — bukan scroll konten host
    vv?.addEventListener('scroll', place);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
    const ro = ref.current ? new ResizeObserver(() => place()) : null;
    if (ro && ref.current) ro.observe(ref.current);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
      vv?.removeEventListener('resize', place);
      vv?.removeEventListener('scroll', place);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
      ro?.disconnect();
    };
  }, [open, place, anchor, onClose, closeOnOutside, popId]);

  const host = hostRef.current;
  if (!host) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          popover="manual"
          data-popover-id={popId}
          data-parent-popover={parentId || undefined}
          role={role}
          aria-label={ariaLabel}
          className={`popover ${className}`}
          style={{
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            width: pos?.w,
            minWidth,
            maxHeight: pos?.maxH,
            transformOrigin: pos?.origin,
            visibility: pos ? 'visible' : 'hidden',
            // dialog[open] memakai display:grid + place-items; jangan ikut ter-center.
            justifySelf: 'start',
            alignSelf: 'start',
            ...style,
          }}
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 520, damping: 34, mass: 0.7 } }}
          exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <ParentPopoverCtx.Provider value={popId}>{children}</ParentPopoverCtx.Provider>
        </motion.div>
      )}
    </AnimatePresence>,
    host,
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
  ariaLabel,
}: {
  items: MenuItem[];
  onClose: () => void;
  onBack?: () => void;
  /** Kelas popover yang diteruskan ke anak menu agar gayanya sama dengan induknya */
  popClassName?: string;
  ariaLabel?: string;
}) {
  const actionable = items.map((it, i) => ({ it, i })).filter((x) => isAction(x.it));
  const menuId = useId();
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

  const itemId = (i: number) => `${menuId}-opt-${i}`;

  return (
    <div
      className="menu"
      role="menu"
      aria-label={ariaLabel}
      aria-activedescendant={active >= 0 ? itemId(active) : undefined}
      tabIndex={-1}
      ref={ref}
      onKeyDown={onKey}
      style={{ outline: 'none' }}
    >
      {items.map((it, i) =>
        it.separator ? (
          <hr key={i} className="menu-sep" />
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
            id={itemId(i)}
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
        <Popover open onClose={closeSub} anchor={subAnchor} placement="right-start" offset={6} minWidth={200} role="none" returnFocus={false} className={popClassName}>
          <MenuList
            items={items[sub].submenu!}
            onClose={() => {
              setSub(null);
              onClose();
            }}
            onBack={closeSub}
            popClassName={popClassName}
            ariaLabel={items[sub].label}
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
  ariaLabel,
}: {
  trigger: (props: { ref: RefObject<HTMLButtonElement | null>; onClick: (e: React.MouseEvent) => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu' }) => ReactNode;
  items: MenuItem[];
  placement?: PopoverProps['placement'];
  minWidth?: number;
  className?: string;
  ariaLabel?: string;
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
        'aria-haspopup': 'menu' as const,
      })}
      <Popover open={open} onClose={close} anchor={ref} placement={placement} minWidth={minWidth} role="none" className={className}>
        <MenuList items={items} onClose={close} popClassName={className} ariaLabel={ariaLabel} />
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
