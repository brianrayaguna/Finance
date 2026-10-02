import { useRef, useState } from 'react';
import { CalendarRange, ChevronDown, Check } from 'lucide-react';
import { Popover } from './Popover';
import { DatePicker } from './DatePicker';
import { Button, Field } from './primitives';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfYear,
  fiscalYearStart,
  formatDate,
  formatMonth,
  periodLabel,
  startOfMonth,
  startOfYear,
  todayISO,
} from '../../lib/format';

export type PresetKey =
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'ytd'
  | 'this_year'
  | 'last_year'
  | 'fiscal_year'
  | 'last_30'
  | 'last_90'
  | 'all'
  | 'custom'
  | 'month';

export interface PeriodValue {
  preset: PresetKey;
  from: string;
  to: string;
}

const quarterStart = (iso: string) => {
  const m = Number(iso.slice(5, 7));
  const q = Math.floor((m - 1) / 3) * 3 + 1;
  return `${iso.slice(0, 4)}-${String(q).padStart(2, '0')}-01`;
};

export function resolvePreset(p: PresetKey, fyStartMonth = 1, today = todayISO()): PeriodValue {
  switch (p) {
    case 'this_month':
      return { preset: p, from: startOfMonth(today), to: endOfMonth(today) };
    case 'last_month': {
      const f = startOfMonth(addMonths(today, -1));
      return { preset: p, from: f, to: endOfMonth(f) };
    }
    case 'this_quarter': {
      const f = quarterStart(today);
      return { preset: p, from: f, to: endOfMonth(addMonths(f, 2)) };
    }
    case 'last_quarter': {
      const f = addMonths(quarterStart(today), -3);
      return { preset: p, from: f, to: endOfMonth(addMonths(f, 2)) };
    }
    case 'ytd':
      return { preset: p, from: startOfYear(today), to: today };
    case 'this_year':
      return { preset: p, from: startOfYear(today), to: endOfYear(today) };
    case 'last_year': {
      const y = String(Number(today.slice(0, 4)) - 1);
      return { preset: p, from: `${y}-01-01`, to: `${y}-12-31` };
    }
    case 'fiscal_year': {
      const f = fiscalYearStart(today, fyStartMonth);
      return { preset: p, from: f, to: addDays(addMonths(f, 12), -1) };
    }
    case 'last_30':
      return { preset: p, from: addDays(today, -29), to: today };
    case 'last_90':
      return { preset: p, from: addDays(today, -89), to: today };
    case 'all':
      return { preset: p, from: '1900-01-01', to: '2999-12-31' };
    default:
      return { preset: 'this_month', from: startOfMonth(today), to: endOfMonth(today) };
  }
}

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'this_month', label: 'Bulan ini' },
  { key: 'last_month', label: 'Bulan lalu' },
  { key: 'this_quarter', label: 'Kuartal ini' },
  { key: 'last_quarter', label: 'Kuartal lalu' },
  { key: 'ytd', label: 'Tahun berjalan (YTD)' },
  { key: 'this_year', label: 'Tahun ini' },
  { key: 'last_year', label: 'Tahun lalu' },
  { key: 'fiscal_year', label: 'Tahun buku berjalan' },
  { key: 'last_30', label: '30 hari terakhir' },
  { key: 'last_90', label: '90 hari terakhir' },
  { key: 'all', label: 'Semua waktu' },
];

export function describePeriod(v: PeriodValue): string {
  if (v.preset === 'all') return 'Semua waktu';
  if (v.preset === 'month') return formatMonth(v.from.slice(0, 7));
  const p = PRESETS.find((x) => x.key === v.preset);
  if (p && v.preset !== 'custom') return p.label;
  return periodLabel(v.from, v.to);
}

export function PeriodPicker({
  value,
  onChange,
  fyStartMonth = 1,
  exclude = [],
}: {
  value: PeriodValue;
  onChange: (v: PeriodValue) => void;
  fyStartMonth?: number;
  exclude?: PresetKey[];
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);
  const ref = useRef<HTMLButtonElement | null>(null);
  const close = () => {
    setOpen(false);
    setCustom(false);
  };
  const sub = value.preset === 'all' ? '' : `${formatDate(value.from)} – ${formatDate(value.to)}`;
  return (
    <>
      <button ref={ref} type="button" className="select-trigger compact period-trigger" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <CalendarRange size={15} style={{ color: 'var(--text-3)' }} />
        <span className="truncate">{describePeriod(value)}</span>
        <ChevronDown className="chev" />
      </button>
      <Popover open={open} onClose={close} anchor={ref} placement="bottom-end" minWidth={custom ? 320 : 250}>
        {!custom ? (
          <div className="menu">
            <div className="menu-label">{sub || 'Rentang waktu'}</div>
            {PRESETS.filter((p) => !exclude.includes(p.key)).map((p) => (
              <button
                key={p.key}
                type="button"
                className="menu-item"
                onClick={() => {
                  onChange(resolvePreset(p.key, fyStartMonth));
                  close();
                }}
              >
                <span className="grow">{p.label}</span>
                {value.preset === p.key && <Check />}
              </button>
            ))}
            <div className="menu-sep" />
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                setFrom(value.preset === 'all' ? startOfMonth(todayISO()) : value.from);
                setTo(value.preset === 'all' ? todayISO() : value.to);
                setCustom(true);
              }}
            >
              <span className="grow">Rentang kustom…</span>
              {value.preset === 'custom' && <Check />}
            </button>
          </div>
        ) : (
          <div style={{ padding: 14 }} className="stack-sm">
            <div className="label-caps">Rentang kustom</div>
            <Field label="Dari">
              <DatePicker value={from} onChange={setFrom} compact />
            </Field>
            <Field label="Sampai" hint={to && from && to < from ? 'Urutan tanggal akan ditukar otomatis' : undefined}>
              <DatePicker value={to} onChange={setTo} compact />
            </Field>
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 6 }}>
              <Button size="sm" variant="ghost" onClick={() => setCustom(false)}>
                Kembali
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={!from || !to}
                onClick={() => {
                  const [a, b] = from <= to ? [from, to] : [to, from];
                  onChange({ preset: 'custom', from: a, to: b });
                  close();
                }}
              >
                Terapkan
              </Button>
            </div>
          </div>
        )}
      </Popover>
    </>
  );
}
