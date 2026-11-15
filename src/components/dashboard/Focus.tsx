import { Link } from 'react-router-dom';
import { ChevronRight } from '../../lib/glyphs';
import { useReminders } from '../../hooks/useReminders';
import { IconTile } from '../ui/primitives';

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
