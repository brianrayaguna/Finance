import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { Popover } from './Popover';
import {
  addDays,
  addMonths,
  DAYS_SHORT,
  formatDate,
  MONTHS,
  parseISO,
  relativeDay,
  startOfMonth,
  todayISO,
} from '../../lib/format';
import { focusNext } from '../../lib/focus';
import { dayIndex, monthMatrix, weekDays } from '../../lib/week';
import { usePrefs } from '../../store/ui';
import { useFieldCtx } from './primitives';

export { monthMatrix };

export function MiniCalendar({
  value,
  onSelect,
  marks,
  autoFocus,
  min,
  max,
}: {
  value?: string;
  onSelect: (d: string) => void;
  marks?: Set<string>;
  autoFocus?: boolean;
  /** Tanggal di luar rentang tampil redup dan tidak dapat dipilih */
  min?: string;
  max?: string;
}) {
  const outOfRange = (d: string) => (!!min && d < min) || (!!max && d > max);
  const today = todayISO();
  const [focused, setFocused] = useState(value || today);
  const [month, setMonth] = useState(startOfMonth(value || today));
  const grid = useRef<HTMLDivElement>(null);
  const weekStart = usePrefs((s) => s.weekStart);
  const days = useMemo(() => monthMatrix(month, weekStart), [month, weekStart]);

  useEffect(() => {
    if (autoFocus) grid.current?.focus();
  }, [autoFocus]);

  const moveTo = (d: string) => {
    setFocused(d);
    if (d.slice(0, 7) !== month.slice(0, 7)) setMonth(startOfMonth(d));
  };

  const onKey = (e: React.KeyboardEvent) => {
    const map: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (map[e.key] !== undefined) {
      e.preventDefault();
      moveTo(addDays(focused, map[e.key]));
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      moveTo(addMonths(focused, e.key === 'PageUp' ? -1 : 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      moveTo(addDays(focused, -dayIndex(focused, weekStart)));
    } else if (e.key === 'End') {
      e.preventDefault();
      moveTo(addDays(focused, 6 - dayIndex(focused, weekStart)));
    } else if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      if (!outOfRange(focused)) onSelect(focused);
    } else if (e.key.toLowerCase() === 't') {
      e.preventDefault();
      moveTo(today);
    }
  };

  const m = parseISO(month);
  return (
    <div className="mini-cal">
      <div className="mc-head">
        <div className="mc-title">
          {MONTHS[m.getMonth()]} <span className="muted">{m.getFullYear()}</span>
        </div>
        <button type="button" className="mc-nav" aria-label="Bulan sebelumnya" onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft />
        </button>
        <button type="button" className="mc-nav" aria-label="Bulan berikutnya" onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight />
        </button>
      </div>
      <div className="mc-week">
        {weekDays(weekStart).map((w) => (
          <span key={w.label} className={w.weekend ? 'wkend' : ''}>
            {w.label}
          </span>
        ))}
      </div>
      <div className="mc-grid" ref={grid} tabIndex={0} onKeyDown={onKey} role="grid" aria-label="Kalender">
        {days.map((d) => {
          const out = d.slice(0, 7) !== month.slice(0, 7);
          const blocked = outOfRange(d);
          return (
            <button
              key={d}
              type="button"
              tabIndex={-1}
              className={[
                'mc-day',
                out && 'out',
                blocked && 'blocked',
                d === today && 'today',
                d === value && 'sel',
                d === focused && 'focus',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => !blocked && onSelect(d)}
              onMouseEnter={() => setFocused(d)}
              aria-label={formatDate(d, 'full')}
              aria-disabled={blocked || undefined}
            >
              {Number(d.slice(8))}
              {marks?.has(d) && <i className="mc-mark" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DatePicker({
  value,
  onChange,
  clearable,
  placeholder = 'Pilih tanggal',
  advance,
  id,
  invalid,
  compact,
  min,
  max,
  presets,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  clearable?: boolean;
  placeholder?: string;
  advance?: boolean;
  id?: string;
  invalid?: boolean;
  compact?: boolean;
  min?: string;
  max?: string;
  /** Pintasan tanggal tambahan di kaki kalender, mis. "Akhir bulan lalu" */
  presets?: { label: string; date: string }[];
  /** Nama untuk pembaca layar bila pemilih tidak berada di dalam Field berlabel */
  ariaLabel?: string;
}) {
  const field = useFieldCtx();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);
  const today = todayISO();
  const allowed = (d: string) => !d || ((!min || d >= min) && (!max || d <= max));
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => ref.current?.focus());
  };
  const change = (d: string) => {
    if (allowed(d)) onChange(d);
  };
  const pick = (d: string) => {
    if (!allowed(d)) return;
    onChange(d);
    setOpen(false);
    requestAnimationFrame(() => {
      if (advance && ref.current) focusNext(ref.current);
      else ref.current?.focus();
    });
  };
  const rel = value ? relativeDay(value, today) : '';
  const isRel = rel === 'Hari ini' || rel === 'Kemarin' || rel === 'Besok';
  return (
    <>
      <button
        ref={ref}
        id={id ?? field?.id}
        aria-describedby={field?.describedBy}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        type="button"
        data-field
        className={['select-trigger', invalid && 'invalid', compact && 'compact'].filter(Boolean).join(' ')}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || (e.key === 'Enter' && !open && !e.metaKey && !e.ctrlKey)) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          } else if (e.key === 'ArrowLeft' && value && !open) {
            e.preventDefault();
            change(addDays(value, -1));
          } else if (e.key === 'ArrowRight' && value && !open) {
            e.preventDefault();
            change(addDays(value, 1));
          } else if (e.key.toLowerCase() === 't' && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            change(today);
          } else if ((e.key === 'Backspace' || e.key === 'Delete') && clearable) {
            e.preventDefault();
            onChange('');
          }
        }}
      >
        <CalendarDays style={{ width: 16, height: 16, color: 'var(--text-3)', flex: 'none' }} />
        {value ? (
          <span className="truncate">
            {compact ? formatDate(value) : `${DAYS_SHORT[parseISO(value).getDay()]}, ${formatDate(value)}`}
            {isRel && !compact && <span className="muted"> · {rel}</span>}
          </span>
        ) : (
          <span className="placeholder">{placeholder}</span>
        )}
        <ChevronDown className="chev" />
      </button>
      <Popover open={open} onClose={close} anchor={ref} minWidth={292}>
        <MiniCalendar value={value || undefined} onSelect={pick} autoFocus min={min} max={max} />
        <div className="mc-foot">
          {(presets ?? [
            { label: 'Hari ini', date: today },
            { label: 'Kemarin', date: addDays(today, -1) },
          ])
            .filter((p) => allowed(p.date))
            .map((p) => (
              <button key={p.label} type="button" className="chip" onClick={() => pick(p.date)}>
                {p.label}
              </button>
            ))}
          {clearable ? (
            <button type="button" className="chip" style={{ marginLeft: 'auto' }} onClick={() => pick('')}>
              Kosongkan
            </button>
          ) : (
            allowed(addDays(today, 30)) && (
              <button type="button" className="chip" style={{ marginLeft: 'auto' }} onClick={() => pick(addDays(today, 30))}>
                +30 hari
              </button>
            )
          )}
        </div>
      </Popover>
    </>
  );
}
