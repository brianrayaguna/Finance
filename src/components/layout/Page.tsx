import { useEffect, useRef, type ReactNode } from 'react';
import { ChevronDown, Ellipsis } from '../../lib/glyphs';
import { useWindowClass } from '../../hooks/useApp';
import { Button, Dots } from '../ui/primitives';
import { Menu } from '../ui/Popover';
import { actionMenuItem, splitPageActions, type PageAction } from './pageActions';

export type { PageAction } from './pageActions';

/**
 * Kepala halaman dengan satu tata letak untuk semua halaman.
 *
 * - medium & expanded: judul dan subjudul di kiri; di kanan `toolbar` (periode/filter), aksi sekunder
 *   (dua pertama sebagai tombol, sisanya di menu ⋯), lalu aksi utama.
 * - compact: judul tampil di bilah atas, jadi di sini hanya untuk pembaca layar. Satu baris alat:
 *   `toolbar` mengisi kiri, menu ⋯ berisi semua aksi sekunder, dan aksi utama berupa ikon di kanan.
 * - `tabs` selalu di baris sendiri di bawahnya.
 */
export function PageHeader({
  title,
  subtitle,
  meta,
  className,
  toolbar,
  primaryAction,
  secondaryActions = [],
  tabs,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Info singkat yang tetap tampil di compact saat judul & subjudul disembunyikan (mis. "29 transaksi"). */
  meta?: ReactNode;
  className?: string;
  /** Kontrol periode/filter halaman. */
  toolbar?: ReactNode;
  primaryAction?: PageAction;
  secondaryActions?: PageAction[];
  tabs?: ReactNode;
}) {
  const windowClass = useWindowClass();
  const { inline, overflow } = splitPageActions(secondaryActions, windowClass);
  const hasActions = Boolean(toolbar || primaryAction || secondaryActions.length);
  return (
    <header className={className ? `page-head ${className}` : 'page-head'}>
      <div className="ph-main">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {meta && (
        <p className="page-meta" aria-hidden>
          {meta}
        </p>
      )}
      {hasActions && (
        <div className="page-actions no-print">
          {toolbar && <div className="pa-toolbar">{toolbar}</div>}
          {inline.map((a) => (
            <ActionButton key={a.label} action={a} variant="ghost" />
          ))}
          {overflow.length > 0 && (
            <Menu
              placement="bottom-end"
              minWidth={220}
              ariaLabel="Aksi lainnya"
              items={overflow.map(actionMenuItem)}
              trigger={(p) => (
                <Button
                  variant="ghost"
                  iconOnly
                  icon={Ellipsis}
                  className="pa-more"
                  ref={p.ref}
                  onClick={p.onClick}
                  aria-expanded={p['aria-expanded']}
                  aria-haspopup={p['aria-haspopup']}
                  aria-label="Aksi lainnya"
                />
              )}
            />
          )}
          {primaryAction && <ActionButton action={primaryAction} variant="primary" collapse />}
        </div>
      )}
      {tabs && <div className="page-tabs-row no-print">{tabs}</div>}
    </header>
  );
}

function ActionButton({ action, variant, collapse }: { action: PageAction; variant: 'primary' | 'ghost'; collapse?: boolean }) {
  const { label, icon, busy, disabled, menu, onSelect } = action;
  const content = busy ? <Dots /> : label;
  if (menu) {
    return (
      <Menu
        placement="bottom-end"
        minWidth={240}
        ariaLabel={label}
        items={menu}
        trigger={(p) => (
          <Button
            variant={variant}
            collapse={collapse}
            icon={busy ? undefined : icon}
            iconRight={busy ? undefined : ChevronDown}
            className="pa-menu-btn"
            ref={p.ref}
            onClick={p.onClick}
            aria-expanded={p['aria-expanded']}
            aria-haspopup={p['aria-haspopup']}
            aria-label={label}
            disabled={disabled || busy}
          >
            {content}
          </Button>
        )}
      />
    );
  }
  return (
    <Button variant={variant} collapse={collapse} icon={busy ? undefined : icon} onClick={onSelect} aria-label={label} disabled={disabled || busy}>
      {content}
    </Button>
  );
}

export interface PageTab<T extends string> {
  value: T;
  label: string;
  /** Angka kecil di samping label, mis. jumlah item yang perlu perhatian. */
  count?: number;
}

/**
 * Tab halaman yang bisa digeser mendatar. Tepi kiri/kanan memudar selama masih ada tab di luar layar,
 * sehingga di ponsel jelas ada tab lain tanpa membuat baris kedua.
 */
export function PageTabs<T extends string>({
  value,
  onChange,
  tabs,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: PageTab<T>[];
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      el.dataset.start = el.scrollLeft > 2 ? 'fade' : '';
      el.dataset.end = el.scrollLeft + el.clientWidth < el.scrollWidth - 2 ? 'fade' : '';
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);
  // Tab aktif digeser ke dalam layar saat berganti (mis. dibuka lewat tautan).
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [value]);

  const move = (dir: 1 | -1) => {
    const i = tabs.findIndex((t) => t.value === value);
    const next = tabs[(i + dir + tabs.length) % tabs.length];
    onChange(next.value);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
  };

  return (
    <div ref={ref} className="page-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((t) => {
        const selected = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            className="page-tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                move(1);
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                move(-1);
              }
            }}
          >
            {t.label}
            {t.count ? <span className="page-tab-count">{t.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
