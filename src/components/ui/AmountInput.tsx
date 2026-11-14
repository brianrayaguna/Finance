import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  amountToDisplay,
  caretFromCount,
  evaluateAmount,
  formatAmountString,
  hasOperator,
  normalizePasted,
  sanitizeAmount,
} from '../../lib/amount';
import { formatMoney } from '../../lib/format';
import { useFieldCtx } from './primitives';

interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
  variant?: 'big' | 'inline';
  invalid?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  id?: string;
  tone?: 'pos' | 'neg';
  ariaLabel?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  allowNegative?: boolean;
}

/**
 * Input nominal: titik ribuan otomatis saat mengetik, koma desimal,
 * kalkulator (+ − × ÷), serta pintasan "k" = ribu dan "j" = juta.
 */
export const AmountInput = forwardRef<HTMLInputElement, Props>(function AmountInput(
  { value, onChange, variant = 'big', invalid, placeholder = '0', autoFocus, id, tone, ariaLabel, className = '', onKeyDown, allowNegative },
  ref,
) {
  const field = useFieldCtx();
  const [text, setText] = useState(() => amountToDisplay(value));
  const inner = useRef<HTMLInputElement | null>(null);
  const pendingCaret = useRef<number | null>(null);
  const lastEmitted = useRef<number | null>(value);

  // sinkron bila nilai berubah dari luar
  useEffect(() => {
    if (value !== lastEmitted.current) {
      setText(amountToDisplay(value));
      lastEmitted.current = value;
    }
  }, [value]);

  useLayoutEffect(() => {
    if (pendingCaret.current !== null && inner.current && document.activeElement === inner.current) {
      const p = pendingCaret.current;
      inner.current.setSelectionRange(p, p);
      pendingCaret.current = null;
    }
  });

  const emit = (s: string) => {
    let v = s.trim() ? evaluateAmount(s) : null;
    if (v !== null && !allowNegative && v < 0) v = Math.abs(v);
    lastEmitted.current = v;
    onChange(v);
  };

  const apply = (raw: string, caret: number) => {
    const count = sanitizeAmount(raw.slice(0, caret)).length;
    const formatted = formatAmountString(sanitizeAmount(raw));
    setText(formatted);
    pendingCaret.current = caretFromCount(formatted, count);
    emit(formatted);
  };

  const settle = () => {
    if (hasOperator(text)) {
      const v = evaluateAmount(text);
      const d = amountToDisplay(v === null ? null : allowNegative ? v : Math.abs(v));
      setText(d);
      emit(d);
    }
  };

  /** Pintasan k/r (ribu) & j (juta): kalikan angka tepat sebelum kursor — "1,5j" → 1.500.000. */
  const scale = (factor: number) => {
    const el = inner.current;
    if (!el) return;
    const s = el.selectionStart ?? text.length;
    const e = el.selectionEnd ?? text.length;
    const before = text.slice(0, s);
    const m = before.match(/[\d.,]+$/);
    if (!m || !/\d/.test(m[0])) return;
    const v = Number(m[0].replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(v)) return;
    const next = before.slice(0, before.length - m[0].length) + amountToDisplay(Math.round(v * factor * 100) / 100);
    apply(next + text.slice(e), next.length);
  };

  const paste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const norm = normalizePasted(e.clipboardData.getData('text'));
    if (norm === null) return;
    e.preventDefault();
    const el = e.currentTarget;
    const s = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, s) + norm;
    apply(next + text.slice(end), next.length);
  };

  const calc = hasOperator(text) ? evaluateAmount(text) : null;

  const input = (
    <input
      ref={(el) => {
        inner.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      id={id ?? field?.id}
      aria-describedby={field?.describedBy}
      data-field
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      aria-label={ariaLabel ?? (field?.hasLabel ? undefined : 'Nominal')}
      aria-invalid={invalid}
      autoFocus={autoFocus}
      placeholder={placeholder}
      value={text}
      onFocus={(e) => {
        const el = e.currentTarget;
        requestAnimationFrame(() => el.select());
      }}
      onChange={(e) => apply(e.target.value, e.target.selectionStart ?? e.target.value.length)}
      onBlur={settle}
      onPaste={paste}
      onKeyDown={(e) => {
        if (!e.metaKey && !e.ctrlKey && !e.altKey) {
          const k = e.key.toLowerCase();
          if (k === 'k' || k === 'r') {
            e.preventDefault();
            scale(1e3);
            return;
          }
          if (k === 'j') {
            e.preventDefault();
            scale(1e6);
            return;
          }
          if (k === '=') {
            e.preventDefault();
            settle();
            return;
          }
        }
        if (e.key === 'Enter') settle();
        onKeyDown?.(e);
      }}
      className={variant === 'inline' ? 'num' : undefined}
    />
  );

  if (variant === 'inline') {
    return (
      <div className={`input amount-inline ${invalid ? 'invalid' : ''} ${className}`}>
        {input}
        {calc !== null && <span className="input-affix" style={{ color: 'var(--accent-ink)' }}>= {formatMoney(calc, { symbol: false })}</span>}
      </div>
    );
  }
  return (
    <div className={['amount-input', invalid && 'invalid', tone && `tone-${tone}`, className].filter(Boolean).join(' ')}>
      <span className="cur">Rp</span>
      {input}
      {calc !== null && <span className="calc num">= {formatMoney(calc)}</span>}
    </div>
  );
});
