import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Popover } from './Popover';
import { normalize } from '../../lib/format';
import { useFieldCtx } from './primitives';

export interface Suggestion {
  value: string;
  meta?: ReactNode;
  icon?: ReactNode;
}

export function AutoComplete({
  value,
  onChange,
  onPick,
  suggestions,
  placeholder,
  icon: I,
  id,
  invalid,
  maxLength = 120,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick?: (s: Suggestion) => void;
  suggestions: Suggestion[];
  placeholder?: string;
  icon?: LucideIcon;
  id?: string;
  invalid?: boolean;
  maxLength?: number;
  autoFocus?: boolean;
}) {
  const field = useFieldCtx();
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const [dismissed, setDismissed] = useState(false);

  const list = useMemo(() => {
    const q = normalize(value.trim());
    if (!q) return [];
    const starts: Suggestion[] = [];
    const contains: Suggestion[] = [];
    for (const s of suggestions) {
      const n = normalize(s.value);
      if (n === q) continue;
      if (n.startsWith(q)) starts.push(s);
      else if (n.includes(q)) contains.push(s);
    }
    return [...starts, ...contains].slice(0, 6);
  }, [value, suggestions]);

  const open = focused && !dismissed && list.length > 0;

  const pick = (s: Suggestion) => {
    onChange(s.value);
    onPick?.(s);
    setDismissed(true);
    setActive(-1);
  };

  return (
    <div ref={wrap} className={`input${invalid ? ' invalid' : ''}`}>
      {I && <I />}
      <input
        ref={input}
        id={id ?? field?.id}
        aria-describedby={field?.describedBy}
        aria-invalid={invalid || undefined}
        aria-autocomplete="list"
        data-field
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setActive(-1);
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setDismissed(false);
          setActive(-1);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => (a + 1) % list.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => (a <= 0 ? list.length - 1 : a - 1));
          } else if ((e.key === 'Enter' || e.key === 'Tab') && active >= 0 && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            e.stopPropagation();
            pick(list[active]);
          }
        }}
      />
      <Popover open={open} onClose={() => setDismissed(true)} anchor={wrap} width="anchor" closeOnOutside={false} role="listbox">
        <div className="listbox" style={{ maxHeight: 240 }}>
          <div className="list-group" style={{ display: 'flex' }}>
            <span>Saran</span>
            <span style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>↑↓ lalu ↵</span>
          </div>
          {list.map((s, i) => (
            <div
              key={s.value}
              role="option"
              aria-selected={i === active}
              className={`option${i === active ? ' active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              onMouseMove={() => setActive(i)}
            >
              {s.icon}
              <span className="truncate grow">{s.value}</span>
              {s.meta && <span className="opt-sub">{s.meta}</span>}
            </div>
          ))}
        </div>
      </Popover>
    </div>
  );
}
