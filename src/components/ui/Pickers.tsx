import { useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Search } from '../../lib/glyphs';
import { ICON_GROUPS, ICONS, PALETTE } from '../../lib/icons';
import { normalize } from '../../lib/format';

const ICON_ALIASES: Record<string, string> = {
  wallet: 'dompet uang', landmark: 'bank', smartphone: 'hp ponsel ewallet', 'credit-card': 'kartu kredit',
  'piggy-bank': 'tabungan celengan', utensils: 'makan', coffee: 'kopi', 'shopping-cart': 'belanja',
  car: 'mobil', motorbike: 'motor', house: 'rumah', zap: 'listrik', wifi: 'internet', 'heart-pulse': 'kesehatan',
  'graduation-cap': 'sekolah pendidikan', gift: 'hadiah', briefcase: 'gaji kerja', plane: 'liburan pesawat',
  baby: 'anak bayi', shield: 'asuransi', gov: 'pajak pemerintah', fuel: 'bensin', film: 'film hiburan',
};

function handleRadioKey<T>(e: KeyboardEvent<HTMLButtonElement>, items: readonly T[], idx: number, onPick: (item: T) => void, grid = false) {
  let next: number | null = null;
  const cols = grid && e.currentTarget.parentElement ? Math.max(1, getComputedStyle(e.currentTarget.parentElement).gridTemplateColumns.split(' ').filter(Boolean).length) : 1;
  if (e.key === 'ArrowRight' || (!grid && e.key === 'ArrowDown')) next = (idx + 1) % items.length;
  else if (e.key === 'ArrowLeft' || (!grid && e.key === 'ArrowUp')) next = (idx - 1 + items.length) % items.length;
  else if (grid && e.key === 'ArrowDown') next = Math.min(items.length - 1, idx + cols);
  else if (grid && e.key === 'ArrowUp') next = Math.max(0, idx - cols);
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = items.length - 1;
  if (next === null || !items.length) return;
  e.preventDefault();
  onPick(items[next]);
  const radios = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
  radios?.[next]?.focus();
}

export function IconPicker({ value, onChange, color }: { value: string; onChange: (v: string) => void; color?: string }) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    if (!q.trim()) return ICON_GROUPS;
    const n = normalize(q);
    const hits = Object.keys(ICONS).filter((k) => normalize(`${k} ${ICON_ALIASES[k] ?? ''}`).includes(n));
    return [{ label: 'Hasil', icons: hits }];
  }, [q]);
  return (
    <div className="icon-picker">
      <div className="input input-sunken" style={{ marginBottom: 10 }}>
        <Search aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari ikon…" aria-label="Cari ikon" />
      </div>
      <div className="icon-picker-scroll">
        {groups.map((g) => {
          const validIcons = g.icons.filter((k) => !!ICONS[k]);
          const activeIdx = validIcons.indexOf(value);
          return (
            <div key={g.label} style={{ marginBottom: 10 }}>
              <div className="label-caps" style={{ margin: '2px 2px 6px' }}>
                {g.label}
              </div>
              <div className="icon-grid" role="radiogroup" aria-label={g.label}>
                {validIcons.map((k, idx) => {
                  const I = ICONS[k];
                  const sel = value === k;
                  const tab = activeIdx >= 0 ? (idx === activeIdx ? 0 : -1) : idx === 0 ? 0 : -1;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={sel}
                      tabIndex={tab}
                      aria-label={k}
                      title={k}
                      className="icon-cell"
                      style={sel && color ? ({ background: color, boxShadow: `0 3px 10px -3px ${color}` } as CSSProperties) : undefined}
                      onClick={() => onChange(k)}
                      onKeyDown={(e) => handleRadioKey(e, validIcons, idx, onChange, true)}
                    >
                      <I />
                    </button>
                  );
                })}
              </div>
              {!validIcons.length && <div className="list-empty">Ikon tidak ditemukan</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const activeIdx = PALETTE.findIndex((p) => p.value.toLowerCase() === value.toLowerCase());
  return (
    <div className="swatches" role="radiogroup" aria-label="Pilih warna">
      {PALETTE.map((p, idx) => {
        const checked = idx === activeIdx;
        const tab = activeIdx >= 0 ? (checked ? 0 : -1) : idx === 0 ? 0 : -1;
        return (
          <button
            key={p.key}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={tab}
            aria-label={p.name}
            title={p.name}
            className="swatch"
            style={{ '--c': p.value } as CSSProperties}
            onClick={() => onChange(p.value)}
            onKeyDown={(e) => handleRadioKey(e, PALETTE, idx, (picked) => onChange(picked.value))}
          />
        );
      })}
    </div>
  );
}
