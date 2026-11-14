import { useMemo, useState, type CSSProperties } from 'react';
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
        <Search />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari ikon…" />
      </div>
      <div className="icon-picker-scroll">
        {groups.map((g) => (
          <div key={g.label} style={{ marginBottom: 10 }}>
            <div className="label-caps" style={{ margin: '2px 2px 6px' }}>
              {g.label}
            </div>
            <div className="icon-grid" role="radiogroup">
              {g.icons.map((k) => {
                const I = ICONS[k];
                if (!I) return null;
                const sel = value === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={sel}
                    aria-label={k}
                    title={k}
                    className="icon-cell"
                    style={sel && color ? ({ background: color, boxShadow: `0 3px 10px -3px ${color}` } as CSSProperties) : undefined}
                    onClick={() => onChange(k)}
                  >
                    <I />
                  </button>
                );
              })}
            </div>
            {!g.icons.length && <div className="list-empty">Ikon tidak ditemukan</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="swatches" role="radiogroup">
      {PALETTE.map((p) => (
        <button
          key={p.key}
          type="button"
          role="radio"
          aria-checked={value.toLowerCase() === p.value.toLowerCase()}
          aria-label={p.name}
          title={p.name}
          className="swatch"
          style={{ '--c': p.value } as CSSProperties}
          onClick={() => onChange(p.value)}
        />
      ))}
    </div>
  );
}
