import { useNavigate } from 'react-router-dom';
import { CalendarDays, List } from '../../lib/glyphs';
import { Segmented } from '../ui/Segmented';

export type TxView = 'daftar' | 'kalender';

/** Tab Daftar | Kalender di halaman Transaksi (Kalender tidak punya menu sendiri). */
export function TxViewSwitch({ value }: { value: TxView }) {
  const nav = useNavigate();
  return (
    <Segmented
      size="sm"
      value={value}
      ariaLabel="Tampilan transaksi"
      onChange={(v) => nav(v === 'kalender' ? '/transaksi?tampil=kalender' : '/transaksi')}
      options={[
        { value: 'daftar', label: 'Daftar', icon: List },
        { value: 'kalender', label: 'Kalender', icon: CalendarDays },
      ]}
    />
  );
}
