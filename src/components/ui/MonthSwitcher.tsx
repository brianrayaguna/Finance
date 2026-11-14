import { ChevronLeft, ChevronRight } from '../../lib/glyphs';
import { addMonths, formatMonth, todayISO } from '../../lib/format';
import { Tooltip } from './Tooltip';

export function MonthSwitcher({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const cur = todayISO().slice(0, 7);
  const shift = (n: number) => onChange(addMonths(value + '-01', n).slice(0, 7));
  return (
    <div className="month-switch">
      <Tooltip label="Bulan sebelumnya">
        <button type="button" className="ms-btn" onClick={() => shift(-1)} aria-label="Bulan sebelumnya">
          <ChevronLeft />
        </button>
      </Tooltip>
      <button type="button" className="ms-label" onClick={() => onChange(cur)} title="Kembali ke bulan ini">
        {formatMonth(value)}
      </button>
      <Tooltip label="Bulan berikutnya">
        <button type="button" className="ms-btn" onClick={() => shift(1)} aria-label="Bulan berikutnya" disabled={value >= cur}>
          <ChevronRight />
        </button>
      </Tooltip>
    </div>
  );
}
