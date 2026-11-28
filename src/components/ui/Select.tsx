import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Search } from '../../lib/glyphs';
import { Popover } from './Popover';
import { IconTile, useFieldCtx } from './primitives';
import { normalize } from '../../lib/format';
import { focusField, focusNext, focusNoScroll, scrollChildIntoContainer } from '../../lib/focus';
import { isImeComposing } from '../../lib/layers';
import { currentWindowClass } from '../../app/breakpoints';

/** Sentuhan / layar sempit: jangan autofokus search (keyboard + zoom + vv loncat). */
function preferTouchUi() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    currentWindowClass() === 'compact' ||
    (navigator.maxTouchPoints ?? 0) > 0
  );
}

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
  const listId = useId();
  const optId = (i: number) => `${listId}-opt-${i}`;
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
      if (refocus) requestAnimationFrame(() => focusNoScroll(trigger.current));
    },
    [],
  );

  const openList = (initialQ = '') => {
    if (disabled) return;
    setQ(initialQ);
    const idx = options.findIndex((o) => o.value === value && !o.disabled);
    const first = Math.max(0, options.findIndex((o) => !o.disabled));
    setActive(initialQ ? first : idx >= 0 ? idx : first);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      // Di sentuhan: jangan fokus search (keyboard + vv loncat). Ketik huruf dari trigger tetap fokus search.
      if (isSearch && (!preferTouchUi() || q)) focusNoScroll(search.current);
      else focusNoScroll(list.current);
      scrollChildIntoContainer(list.current, list.current?.querySelector<HTMLElement>('.option.active'));
    });
    // q sengaja tidak di deps — hanya keputusan fokus saat buka
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isSearch]);

  useEffect(() => {
    if (!open) return;
    scrollChildIntoContainer(list.current, list.current?.querySelector<HTMLElement>('.option.active'));
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
      else focusField(trigger.current);
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
        if (isImeComposing(e)) return;
        if (e.metaKey || e.ctrlKey) {
          setOpen(false);
          setQ('');
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        choose(filtered[active]);
        break;
      case 'Tab': {
        e.preventDefault();
        const item = !e.shiftKey ? filtered[active] : undefined;
        if (item && !item.disabled) {
          choose(item);
        } else {
          setOpen(false);
          setQ('');
          requestAnimationFrame(() => {
            if (trigger.current) focusNext(trigger.current, e.shiftKey ? -1 : 1);
          });
        }
        break;
      }
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
  const activeDescendant = filtered[active] ? optId(active) : undefined;

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
        aria-controls={open ? listId : undefined}
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
      <Popover open={open} onClose={() => close()} anchor={trigger} width={width} minWidth={compact ? 220 : undefined} role="none" returnFocus={false}>
        {isSearch && (
          <div className="popover-search">
            <Search aria-hidden />
            <input
              ref={search}
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-activedescendant={activeDescendant}
              aria-label="Cari opsi"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onListKey}
              placeholder="Cari…"
              spellCheck={false}
            />
          </div>
        )}
        <div
          id={listId}
          role="listbox"
          aria-activedescendant={activeDescendant}
          className="listbox"
          ref={list}
          tabIndex={-1}
          onKeyDown={onListKey}
          style={{ outline: 'none' }}
        >
          {filtered.length === 0 && <div className="list-empty">{emptyText}</div>}
          {filtered.map((o, i) => {
            const head = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            return (
              <div key={o.value} role="presentation">
                {head && <div className="list-group">{head}</div>}
                <div
                  id={optId(i)}
                  role="option"
                  aria-selected={o.value === value}
                  aria-disabled={o.disabled}
                  className={`option${i === active ? ' active' : ''}`}
                  style={o.disabled ? { opacity: 0.4, cursor: 'default' } : undefined}
                  onMouseMove={() => !o.disabled && active !== i && setActive(i)}
                  onPointerDown={(e) => {
                    // Hanya mouse: cegah blur search. preventDefault di touch mematahkan scroll/tap di mobile.
                    if (e.pointerType === 'mouse') e.preventDefault();
                  }}
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
