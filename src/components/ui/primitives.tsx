import { createContext, forwardRef, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Check, Minus, X, CircleAlert } from '../../lib/glyphs';
import type { Glyph } from '../../lib/glyphs';
import { formatMoney, type MoneyOpts } from '../../lib/format';
import { getIcon } from '../../lib/icons';

/* ───────── Button ───────── */

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'tinted' | 'danger' | 'danger-ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: Glyph;
  iconRight?: Glyph;
  iconOnly?: boolean;
  block?: boolean;
  kbd?: string[];
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: I, iconRight: IR, iconOnly, block, kbd, className = '', children, type = 'button', ...rest },
  ref,
) {
  const cls = [
    'btn',
    variant !== 'secondary' && `btn-${variant}`,
    size !== 'md' && `btn-${size}`,
    iconOnly && 'btn-icon',
    block && 'btn-block',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button ref={ref} type={type} className={cls} {...rest}>
      {I && <I aria-hidden />}
      {children}
      {IR && <IR aria-hidden />}
      {kbd && kbd.map((k) => <span key={k} className="kbd">{k}</span>)}
    </button>
  );
});

/* ───────── Kbd ───────── */

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>;
}

/* ───────── Icon tile ───────── */

export function IconTile({
  icon,
  color,
  size,
  solid,
  round,
  className = '',
  style,
}: {
  icon?: string | Glyph;
  color?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  solid?: boolean;
  round?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const I = typeof icon === 'string' || !icon ? getIcon(icon as string) : icon;
  return (
    <span
      className={['icon-tile', size && size !== 'md' && size, solid && 'solid', round && 'round', className].filter(Boolean).join(' ')}
      style={{ ...(color ? ({ '--c': color } as CSSProperties) : {}), ...style }}
      aria-hidden
    >
      <I />
    </span>
  );
}

/* ───────── Badge ───────── */

export function Badge({
  tone = 'default',
  dot,
  icon: I,
  children,
  className = '',
}: {
  tone?: 'default' | 'pos' | 'neg' | 'warn' | 'info' | 'accent';
  dot?: boolean;
  icon?: Glyph;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={['badge', tone !== 'default' && `badge-${tone}`, dot && 'badge-dot', className].filter(Boolean).join(' ')}>
      {I && <I />}
      {children}
    </span>
  );
}

/* ───────── Switch & Checkbox ───────── */

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="switch"
      onClick={() => onChange(!checked)}
    />
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  mixed,
}: {
  checked: boolean;
  onChange: (v: boolean, e: React.MouseEvent) => void;
  label?: string;
  mixed?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={mixed ? 'mixed' : checked}
      aria-label={label}
      className="check"
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked, e);
      }}
    >
      {mixed ? <Minus /> : <Check />}
    </button>
  );
}

/* ───────── Progress ───────── */

export function Progress({ value, color, thin, marker, label = 'Kemajuan' }: { value: number; color?: string; thin?: boolean; marker?: number; label?: string }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(Math.max(0, Math.min(1, value))));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return (
    <div
      className={`progress${thin ? ' thin' : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.max(0, Math.round(value * 100))}
      aria-valuemin={0}
      aria-valuemax={Math.max(100, Math.round(value * 100))}
    >
      <span style={{ clipPath: `inset(0 ${(1 - w) * 100}% 0 0 round 999px)`, ...(color ? ({ '--c': color } as CSSProperties) : {}) }} />
      {marker !== undefined && marker > 0 && marker < 1 && <i className="marker" style={{ left: `calc(${marker * 100}% - 1px)` }} />}
    </div>
  );
}

/* ───────── Empty state ───────── */

export function EmptyState({
  icon: I,
  title,
  text,
  action,
  compact,
}: {
  icon: Glyph;
  title: string;
  text?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`empty${compact ? ' compact' : ''}`}>
      <div className="empty-art">
        <I />
      </div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

/* ───────── Field & inputs ───────── */

/**
 * Konteks bidang: menghubungkan <label> dengan kontrolnya (id/htmlFor) serta pesan galat/petunjuk
 * (aria-describedby), sehingga setiap input punya nama yang dibacakan pembaca layar dan label dapat diklik.
 */
interface FieldCtxValue {
  id: string;
  describedBy?: string;
  hasLabel: boolean;
}
const FieldCtx = createContext<FieldCtxValue | null>(null);
export const useFieldCtx = () => useContext(FieldCtx);

export function Field({
  label,
  hint,
  error,
  optional,
  children,
  className = '',
  htmlFor,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null | false;
  optional?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  const auto = useId();
  const id = htmlFor ?? auto;
  const msgId = `${id}-msg`;
  const ctx: FieldCtxValue = { id, describedBy: error || hint ? msgId : undefined, hasLabel: !!label };
  return (
    <div className={`field ${className}`}>
      {label && (
        <label className="field-label" htmlFor={id}>
          {label}
          {optional && <span className="opt">· opsional</span>}
        </label>
      )}
      <FieldCtx.Provider value={ctx}>{children}</FieldCtx.Provider>
      {error ? (
        <span className="field-error" id={msgId}>
          <CircleAlert size={13} aria-hidden />
          {error}
        </span>
      ) : hint ? (
        <span className="field-hint" id={msgId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'prefix'> {
  value: string;
  onChange: (v: string) => void;
  icon?: Glyph;
  prefix?: ReactNode;
  suffix?: ReactNode;
  clearable?: boolean;
  invalid?: boolean;
  sunken?: boolean;
  wrapClassName?: string;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { value, onChange, icon: I, prefix, suffix, clearable, invalid, sunken, wrapClassName = '', ...rest },
  ref,
) {
  const inner = useRef<HTMLInputElement | null>(null);
  const f = useFieldCtx();
  return (
    <div className={['input', invalid && 'invalid', sunken && 'input-sunken', wrapClassName].filter(Boolean).join(' ')} onMouseDown={(e) => {
      if (e.target === e.currentTarget) {
        e.preventDefault();
        inner.current?.focus();
      }
    }}>
      {I && <I />}
      {prefix && <span className="input-affix">{prefix}</span>}
      <input
        ref={(el) => {
          inner.current = el;
          if (typeof ref === 'function') ref(el);
          else if (ref) ref.current = el;
        }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={invalid || undefined}
        aria-describedby={f?.describedBy}
        {...rest}
        id={rest.id ?? f?.id}
      />
      {clearable && value && (
        <button
          type="button"
          className="input-clear"
          aria-label="Hapus"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange('');
            inner.current?.focus();
          }}
        >
          <X />
        </button>
      )}
      {suffix && <span className="input-affix">{suffix}</span>}
    </div>
  );
});

interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  value: string;
  onChange: (v: string) => void;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea({ value, onChange, rows = 2, ...rest }, ref) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  }, [value]);
  const f = useFieldCtx();
  return (
    <div className="input input-textarea">
      <textarea
        ref={(el) => {
          inner.current = el;
          if (typeof ref === 'function') ref(el);
          else if (ref) ref.current = el;
        }}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={f?.describedBy}
        {...rest}
        id={rest.id ?? f?.id}
      />
    </div>
  );
});

/* ───────── Money ───────── */

export function Money({
  value,
  tone = 'none',
  className = '',
  ...opts
}: { value: number; tone?: 'none' | 'auto' | 'pos' | 'neg' | 'flow'; className?: string } & MoneyOpts) {
  let t = '';
  if (tone === 'auto') t = value > 0.004 ? 'pos' : value < -0.004 ? 'neg' : '';
  else if (tone === 'flow') t = value > 0.004 ? 'pos' : '';
  else if (tone !== 'none') t = tone;
  return <span className={['money-val num', t, className].filter(Boolean).join(' ')}>{formatMoney(value, opts)}</span>;
}

/* ───────── Tabel yang dapat digulir ───────── */

/** Pembungkus tabel lebar: dapat difokus & digulir dengan keyboard hanya bila isinya memang meluber. */
export function TableWrap({ label, style, children }: { label: string; style?: CSSProperties; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setScrolls(el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className="table-wrap"
      style={style}
      role={scrolls ? 'region' : undefined}
      aria-label={scrolls ? label : undefined}
      tabIndex={scrolls ? 0 : undefined}
    >
      {children}
    </div>
  );
}

/* ───────── Animated number ───────── */

export function AnimatedMoney({ value, duration = 900, ...opts }: { value: number; duration?: number; className?: string } & MoneyOpts) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef(0);
  useEffect(() => {
    const reduce = document.documentElement.dataset.motion === 'reduce' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now();
    const a = from.current;
    const b = value;
    if (reduce || a === b) {
      setShown(b);
      from.current = b;
      return;
    }
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - p, 4);
      const v = a + (b - a) * e;
      setShown(p < 1 ? Math.round(v) : b);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf.current);
      from.current = value;
    };
  }, [value, duration]);
  const { className, ...mo } = opts;
  return <span className={`money-val num ${className ?? ''}`}>{formatMoney(shown, mo)}</span>;
}

/* ───────── Spinner-less loading dots (for export) ───────── */

export function Dots() {
  return (
    <span className="row" style={{ gap: 3 }} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 4,
            height: 4,
            borderRadius: 4,
            background: 'currentColor',
            animation: `pulse-dot 1s ${i * 0.15}s infinite ease-in-out`,
          }}
        />
      ))}
    </span>
  );
}
