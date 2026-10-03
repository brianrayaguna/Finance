import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ChevronRight, HandCoins } from '../../lib/glyphs';
import { useReminders } from '../../hooks/useReminders';
import { useUI } from '../../store/ui';
import { Button, IconTile } from '../ui/primitives';

const ACTIONS = [
  { label: 'Pengeluaran', icon: ArrowUpRight, type: 'expense' as const, primary: true },
  { label: 'Pemasukan', icon: ArrowDownLeft, type: 'income' as const },
  { label: 'Transfer', icon: ArrowLeftRight, type: 'transfer' as const },
  { label: 'Hutang baru', icon: HandCoins, type: 'payable_new' as const },
];

/** Jalur cepat ke pencatatan: empat jenis transaksi yang paling sering dipakai. */
export function QuickActions() {
  const openTx = useUI((s) => s.openTx);
  return (
    <div className="quick-actions no-print" role="group" aria-label="Catat cepat">
      {ACTIONS.map((a) => (
        <Button key={a.type} variant={a.primary ? 'primary' : 'secondary'} icon={a.icon} onClick={() => openTx({ type: a.type })}>
          {a.label}
        </Button>
      ))}
    </div>
  );
}

const SHOWN = 3;

/** Hal yang butuh tindakan sekarang: jatuh tempo, anggaran terlampaui, masalah integritas. */
export function AttentionStrip() {
  const { items } = useReminders();
  if (items.length === 0) return null;
  const shown = [...items].sort((a, b) => Number(b.tone === 'neg') - Number(a.tone === 'neg')).slice(0, SHOWN);
  const rest = items.length - shown.length;
  return (
    <section className="attention" aria-label="Perlu perhatian">
      <ul className="attention-list">
        {shown.map((r) => (
          <li key={r.id}>
            <Link to={r.to} className={`attention-item tone-${r.tone}`}>
              <IconTile icon={r.icon} color={r.tone === 'neg' ? 'var(--neg)' : 'var(--warn)'} size="sm" />
              <span className="attention-text">
                <span className="attention-title">{r.title}</span>
                <span className="attention-detail">
                  {r.when ? `${r.when} · ` : ''}
                  {r.detail}
                </span>
              </span>
              <ChevronRight aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      {rest > 0 && <p className="attention-more">+{rest} pengingat lain di lonceng bilah atas</p>}
    </section>
  );
}
