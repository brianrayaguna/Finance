import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Popover } from './Popover';
import { IconTile, useFieldCtx } from './primitives';
import { normalize } from '../../lib/format';
import { focusNext } from '../../lib/focus';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  group?: string;
  icon?: string;
  color?: string;
  sub?: ReactNode;
  description?: string;
  keywords?: string;
  disabled?: boolean;
}

interface SelectProps<T extends string> {
  value: T | '' | undefined | null;
  onChange: (v: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  searchable?: boolean;
  invalid?: boolean;
  compact?: boolean;
  id?: string;
  disabled?: boolean;
  advance?: boolean;
  width?: number | 'anchor';
  renderValue?: (o: SelectOption<T>) => ReactNode;
  emptyText?: string;
  footer?: ReactNode;
  showIcon?: boolean;
  ariaLabel?: string;
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder = 'Pilih…',
  searchable,
  invalid,
  compact,
  id,
  disabled,
  advance,
  width = 'anchor',
  renderValue,
  emptyText = 'Tidak ada hasil',
  footer,
  showIcon = true,
  ariaLabel,
}: SelectProps<T>) {
  const field = useFieldCtx();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const isSearch = searchable ?? options.length > 8;

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    if (!q.trim()) return options;
    const n = normalize(q.trim());
    return options.filter((o) => normalize(`${o.label} ${o.group ?? ''} ${o.keywords ?? ''} ${o.description ?? ''}`).includes(n));
  }, [options, q]);

  const enabledIdx = useMemo(() => filtered.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0), [filtered]);

  const close = useCallback(
    (refocus = true) => {
      setOpen(false);
      setQ('');
      if (refocus) requestAnimationFrame(() => trigger.current?.focus());
    },
    [],
  );

  const openList = (initialQ = '') => {
    if (disabled) return;
    setQ(initialQ);
    const idx = Math.max(0, options.findIndex((o) => o.value === value));
    setActive(initialQ ? 0 : idx);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      if (isSearch) search.current?.focus();
      else list.current?.focus();
      list.current?.querySelector('.option.active')?.scrollIntoView({ block: 'nearest' });
    });
  }, [open, isSearch]);

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector('.option.active')?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  useEffect(() => {
    if (q) setActive(enabledIdx[0] ?? 0);
  }, [q, enabledIdx]);

  const choose = (o: SelectOption<T> | undefined) => {
    if (!o || o.disabled) return;
    onChange(o.value);
    setOpen(false);
    setQ('');
    requestAnimationFrame(() => {
      if (advance && trigger.current) focusNext(trigger.current);
      else trigger.current?.focus();
    });
  };

  const move = (dir: 1 | -1) => {
    if (!enabledIdx.length) return;
    const pos = enabledIdx.indexOf(active);
    const next = pos < 0 ? enabledIdx[0] : enabledIdx[(pos + dir + enabledIdx.length) % enabledIdx.length];
    setActive(next);
  };

  const onListKey = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        break;
      case 'Home':
        if (!isSearch) {
          e.preventDefault();
          setActive(enabledIdx[0] ?? 0);
        }
        break;
      case 'End':
        if (!isSearch) {
          e.preventDefault();
          setActive(enabledIdx[enabledIdx.length - 1] ?? 0);
        }
        break;
      case 'Enter':
        if (e.metaKey || e.ctrlKey) {
          setOpen(false);
          setQ('');
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        choose(filtered[active]);
        break;
      case 'Tab':
        e.preventDefault();
        choose(filtered[active]);
        break;
      default:
        if (!isSearch && e.key.length === 1 && /\S/.test(e.key)) {
          const k = normalize(e.key);
          const start = active + 1;
          for (let j = 0; j < filtered.length; j++) {
            const i = (start + j) % filtered.length;
            if (!filtered[i].disabled && normalize(filtered[i].label).startsWith(k)) {
              setActive(i);
              break;
            }
          }
        }
    }
  };

  let lastGroup: string | undefined;

  return (
    <>
      <button
        ref={trigger}
        id={id ?? field?.id}
        aria-describedby={field?.describedBy}
        aria-invalid={invalid || undefined}
        type="button"
        className={['select-trigger', invalid && 'invalid', compact && 'compact'].filter(Boolean).join(' ')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        data-field
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            openList();
          } else if (e.key === 'Enter' && !open && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            e.stopPropagation();
            openList();
          } else if (isSearch && e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            openList(e.key);
          } else if ((e.key === 'Backspace' || e.key === 'Delete') && !open) {
            // tidak menghapus nilai wajib; biarkan
          }
        }}
      >
        {selected ? (
          renderValue ? (
            renderValue(selected)
          ) : (
            <>
              {showIcon && selected.icon && <IconTile icon={selected.icon} color={selected.color} size="xs" />}
              <span className="truncate">{selected.label}</span>
            </>
          )
        ) : (
          <span className="placeholder truncate">{placeholder}</span>
        )}
        <ChevronDown className="chev" />
      </button>
      <Popover open={open} onClose={() => close()} anchor={trigger} width={width} minWidth={compact ? 220 : undefined} role="listbox">
        {isSearch && (
          <div className="popover-search">
            <Search />
            <input
              ref={search}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onListKey}
              placeholder="Cari…"
              spellCheck={false}
            />
          </div>
        )}
        <div className="listbox" ref={list} tabIndex={-1} onKeyDown={isSearch ? undefined : onListKey} style={{ outline: 'none' }}>
          {filtered.length === 0 && <div className="list-empty">{emptyText}</div>}
          {filtered.map((o, i) => {
            const head = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            return (
              <div key={o.value}>
                {head && <div className="list-group">{head}</div>}
                <div
                  role="option"
                  aria-selected={o.value === value}
                  aria-disabled={o.disabled}
                  className={`option${i === active ? ' active' : ''}`}
                  style={o.disabled ? { opacity: 0.4, cursor: 'default' } : undefined}
                  onMouseMove={() => !o.disabled && active !== i && setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                >
                  {showIcon && o.icon && <IconTile icon={o.icon} color={o.color} size="sm" />}
                  <span className="col grow" style={{ minWidth: 0 }}>
                    <span className="truncate">{o.label}</span>
                    {o.description && <span className="opt-desc truncate">{o.description}</span>}
                  </span>
                  {o.sub !== undefined && <span className="opt-sub">{o.sub}</span>}
                  {o.value === value && <Check className="check-mark" />}
                </div>
              </div>
            );
          })}
        </div>
        {footer}
      </Popover>
    </>
  );
}
