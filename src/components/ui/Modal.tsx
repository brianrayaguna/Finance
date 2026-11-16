import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "../../lib/glyphs";
import { focusField, focusNoScroll } from "../../lib/focus";
import { layerCount, useLayer } from "../../lib/layers";

export function useFocusTrap(
  active: boolean,
  root: React.RefObject<HTMLElement | null>,
  initial?: string,
) {
  useEffect(() => {
    if (!active) return;
    const prev = document.activeElement as HTMLElement | null;
    // Di HP, fokus ke kolom isian memunculkan keyboard dan mengubah ukuran layar. Bila terjadi di tengah
    // animasi masuk, animasinya patah-patah — tunda sampai animasi selesai.
    const touch =
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches;
    let raf = 0;
    const focusTimer = window.setTimeout(
      () => (raf = requestAnimationFrame(focusInitial)),
      touch ? ENTER_MS : 0,
    );
    function focusInitial() {
      const el = root.current;
      if (!el) return;
      const target =
        (initial && el.querySelector<HTMLElement>(initial)) ||
        el.querySelector<HTMLElement>("[data-autofocus]") ||
        el.querySelector<HTMLElement>("[data-field]") ||
        el.querySelector<HTMLElement>(
          "button:not(.close-btn), input, textarea",
        );
      focusField(target);
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !root.current) return;
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
        focusNoScroll(last);
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        focusNoScroll(first);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusTimer);
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      if (prev && document.contains(prev)) {
        requestAnimationFrame(() => {
          if (layerCount() === 0 && document.contains(prev))
            focusNoScroll(prev);
        });
      }
    };
  }, [active, root, initial]);
}

export function useDialogTopLayer(open: boolean) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);

  useLayoutEffect(() => {
    const d = dlg.current;
    if (!d || !open) return;
    if (!d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
      window.dispatchEvent(new CustomEvent("top-layer-open"));
    }
  }, [open, present]);

  // Animasi keluar memakai CSS (.is-closing); setelah durasinya, dialog ditutup & dilepas dari DOM.
  useEffect(() => {
    if (open || !present) return;
    const t = window.setTimeout(() => {
      const d = dlg.current;
      if (d?.open) {
        if (typeof d.close === "function") d.close();
        else d.removeAttribute("open");
      }
      setPresent(false);
    }, EXIT_MS);
    return () => window.clearTimeout(t);
  }, [open, present]);

  return { dlg, present, closing: present && !open };
}

/** Durasi animasi masuk/keluar dialog — samakan dengan ui.css (modal-in, modal-out, sheet-up, …). */
const ENTER_MS = 300;
const EXIT_MS = 200;

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  initialFocus?: string;
  headerExtra?: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Nama dialog untuk pembaca layar bila tidak ada judul yang terlihat */
  ariaLabel?: string;
  role?: "dialog" | "alertdialog";
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  size = "md",
  initialFocus,
  headerExtra,
  className = "",
  bodyClassName = "",
  ariaLabel,
  role = "dialog",
}: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const backdropDown = useRef(false);
  const titleId = useId();
  const { dlg, present, closing } = useDialogTopLayer(open);
  useLayer(open, onClose);
  useFocusTrap(open, ref, initialFocus);

  if (!present) return null;

  const hasHead = !!(title || icon);

  return createPortal(
    <dialog
      ref={dlg}
      className={`modal-dialog${closing ? " is-closing" : ""}`}
      role={role === "alertdialog" ? "alertdialog" : undefined}
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
      <>
        <div
          className="modal-backdrop"
          onPointerDown={(e) => {
            backdropDown.current = e.target === e.currentTarget;
          }}
          onClick={(e) => {
            if (
              role !== "alertdialog" &&
              open &&
              backdropDown.current &&
              e.target === e.currentTarget
            )
              onClose();
            backdropDown.current = false;
          }}
        />
        <div
          ref={ref}
          className={`modal ${size !== "md" ? `modal-${size}` : ""} ${className}`}
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
              <button
                type="button"
                className="close-btn"
                onClick={onClose}
                aria-label="Tutup"
              >
                <X />
              </button>
            </div>
          ) : (
            role !== "alertdialog" && (
              <button
                type="button"
                className="close-btn modal-float-close"
                onClick={onClose}
                aria-label="Tutup"
              >
                <X />
              </button>
            )
          )}
          <div className={`modal-body ${bodyClassName}`}>{children}</div>
          {footer && <div className="modal-foot">{footer}</div>}
        </div>
      </>
    </dialog>,
    document.body,
  );
}

export function Sheet({
  open,
  onClose,
  children,
  width,
  ariaLabel,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const backdropDown = useRef(false);
  const { dlg, present, closing } = useDialogTopLayer(open);
  useLayer(open, onClose);
  useFocusTrap(open, ref);

  if (!present) return null;

  return createPortal(
    <dialog
      ref={dlg}
      className={`sheet-dialog${closing ? " is-closing" : ""}`}
      aria-modal="true"
      aria-label={ariaLabel}
      onCancel={(e) => {
        e.preventDefault();
      }}
      onClose={() => {
        if (open) onClose();
      }}
    >
      <div
        className="modal-backdrop sheet-backdrop"
        onPointerDown={(e) => {
          backdropDown.current = e.target === e.currentTarget;
        }}
        onClick={(e) => {
          if (open && backdropDown.current && e.target === e.currentTarget)
            onClose();
          backdropDown.current = false;
        }}
      />
      <div
        ref={ref}
        className="sheet"
        style={
          width ? { width: `min(${width}px, calc(100vw - 20px))` } : undefined
        }
      >
        {children}
      </div>
    </dialog>,
    document.body,
  );
}
