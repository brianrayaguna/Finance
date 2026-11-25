import { useId, useRef, type ReactNode } from 'react';
import { SlidePill } from './SlidePill';
import type { Glyph } from '../../lib/glyphs';

export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: Glyph;
  title?: string;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  block,
  ariaLabel,
  className = '',
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegOption<T>[];
  size?: 'sm' | 'md';
  block?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = options.findIndex((o) => o.value === value);
  const onKey = (e: React.KeyboardEvent) => {
    if (!options.length || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const cur = idx < 0 ? 0 : idx;
    const n = (cur + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length;
    onChange(options[n].value);
    refs.current[n]?.focus();
  };
  return (
    <div
      role="tablist"
      data-pill-root
      aria-label={ariaLabel}
      className={['seg', size === 'sm' && 'seg-sm', block && 'seg-block', className].filter(Boolean).join(' ')}
      onKeyDown={onKey}
    >
      {options.map((o, i) => {
        const sel = o.value === value;
        const focusable = sel || (idx < 0 && i === 0);
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={sel}
            tabIndex={focusable ? 0 : -1}
            title={o.title}
            className="seg-item"
            onClick={() => onChange(o.value)}
          >
            {sel && (
              <SlidePill group={`seg-${id}`} className="seg-thumb" />
            )}
            {o.icon && <o.icon />}
            <span className="seg-label">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
