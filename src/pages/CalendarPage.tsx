import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Grid3x3, Inbox } from 'lucide-react';
import { useBooks, useToday } from '../hooks/useApp';
import { usePrefs, useUI } from '../store/ui';
import { debtInfos } from '../accounting/reports';
import type { Transaction } from '../accounting/types';
import {
  addDays,
  addMonths,
  DAYS,
  formatDate,
  formatMoney,
  MONTHS,
  parseISO,
  startOfMonth,
  compactNumber,
} from '../lib/format';
import { isTypingTarget, layerCount } from '../lib/layers';
import { PageHeader } from '../components/layout/Topbar';
import { Badge, Button, EmptyState, IconTile, Money } from '../components/ui/primitives';
import { Segmented } from '../components/ui/Segmented';
import { isWeekend, monthMatrix, weekDays } from '../lib/week';
import { TxRow } from '../components/tx/TxRow';
import { TxViewSwitch } from '../components/tx/TxViewSwitch';
import { txFlow } from '../components/tx/txDisplay';

interface DayAgg {
  inc: number;
  exp: number;
  count: number;
  txs: Transaction[];
}

export default function CalendarPage() {
  const b = useBooks();
  const today = useToday();
  const openTx = useUI((s) => s.openTx);
  const editTx = useUI((s) => s.editTx);
  const weekStart = usePrefs((s) => s.weekStart);
  const [params, setParams] = useSearchParams();
  // ?tanggal=YYYY-MM-DD membuka kalender pada hari tersebut (mis. dari peta panas di dasbor)
  const initial = /^\d{4}-\d{2}-\d{2}$/.test(params.get('tanggal') ?? '') ? params.get('tanggal')! : today;
  const [view, setView] = useState<'month' | 'year'>('month');
  const [sel, setSel] = useState(initial);
  const [month, setMonth] = useState(startOfMonth(initial));

  useEffect(() => {
    if (params.get('tanggal')) setParams({ tampil: 'kalender' }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [dir, setDir] = useState(0);

  const byDay = useMemo(() => {
    const m = new Map<string, DayAgg>();
    for (const t of b.data.transactions) {
      let d = m.get(t.date);
      if (!d) m.set(t.date, (d = { inc: 0, exp: 0, count: 0, txs: [] }));
      d.count++;
      d.txs.push(t);
      const f = txFlow(t);
      d.inc += f.inc;
      d.exp += f.exp;
    }
    for (const d of m.values()) d.txs.sort((x, y) => (y.time ?? '').localeCompare(x.time ?? '') || y.createdAt - x.createdAt);
    return m;
  }, [b]);

  const dues = useMemo(() => {
    const m = new Map<string, ReturnType<typeof debtInfos>>();
    for (const d of debtInfos(b.data, '9999-12-31')) {
      if (!d.tx.dueDate || d.remaining <= 0.005) continue;
      const arr = m.get(d.tx.dueDate) ?? [];
      arr.push(d);
      m.set(d.tx.dueDate, arr);
    }
    return m;
  }, [b]);

  const days = useMemo(() => monthMatrix(month, weekStart), [month, weekStart]);
  const monthKey = month.slice(0, 7);
  const monthStats = useMemo(() => {
    let inc = 0;
    let exp = 0;
    let active = 0;
    let maxExp = 0;
    let maxDay = '';
    for (const [d, a] of byDay) {
      if (!d.startsWith(monthKey)) continue;
      inc += a.inc;
      exp += a.exp;
      if (a.count) active++;
      if (a.exp > maxExp) {
        maxExp = a.exp;
        maxDay = d;
      }
    }
    return { inc, exp, active, maxExp, maxDay };
  }, [byDay, monthKey]);

  const moveSel = (d: string) => {
    setSel(d);
    if (d.slice(0, 7) !== month.slice(0, 7)) {
      setDir(d > month ? 1 : -1);
      setMonth(startOfMonth(d));
    }
  };
  const shiftMonth = (n: number) => {
    setDir(n);
    const m = addMonths(month, n);
    setMonth(m);
    setSel(m.slice(0, 7) === today.slice(0, 7) ? today : m);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (layerCount() > 0 || isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const map: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      if (view === 'month' && map[e.key] !== undefined) {
        e.preventDefault();
        moveSel(addDays(sel, map[e.key]));
      } else if (e.key === 'PageUp' || e.key === '[') {
        e.preventDefault();
        if (view === 'year') setMonth(addMonths(month, -12));
        else shiftMonth(-1);
      } else if (e.key === 'PageDown' || e.key === ']') {
        e.preventDefault();
        if (view === 'year') setMonth(addMonths(month, 12));
        else shiftMonth(1);
      } else if (e.key.toLowerCase() === 't') {
        e.preventDefault();
        moveSel(today);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        openTx({ date: sel });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const selAgg = byDay.get(sel);
  const selDues = dues.get(sel) ?? [];
  const txById = useMemo(() => new Map(b.data.transactions.map((t) => [t.id, t])), [b]);
  const m = parseISO(month);

  return (
    <div>
      <PageHeader
        title="Transaksi"
        subtitle={view === 'month' ? `${MONTHS[m.getMonth()]} ${m.getFullYear()} · ${monthStats.active} hari dengan transaksi` : `Tahun ${m.getFullYear()} · intensitas pengeluaran harian`}
        actions={
          <>
            <TxViewSwitch value="kalender" />
            <Segmented
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: 'month', label: 'Bulan', icon: CalendarDays },
                { value: 'year', label: 'Tahun', icon: Grid3x3 },
              ]}
            />
            <div className="month-switch">
              <button type="button" className="ms-btn" onClick={() => (view === 'year' ? setMonth(addMonths(month, -12)) : shiftMonth(-1))} aria-label="Sebelumnya">
                <ChevronLeft />
              </button>
              <button type="button" className="ms-label" onClick={() => moveSel(today)}>
                Hari ini
              </button>
              <button type="button" className="ms-btn" onClick={() => (view === 'year' ? setMonth(addMonths(month, 12)) : shiftMonth(1))} aria-label="Berikutnya">
                <ChevronRight />
              </button>
            </div>
          </>
        }
      />

      {view === 'month' ? (
        <div className="cal-layout">
          <div className="card cal-card">
            <div className="cal-summary">
              <div>
                <span>Pemasukan</span>
                <Money value={monthStats.inc} className="pos" />
              </div>
              <div>
                <span>Pengeluaran</span>
                <Money value={monthStats.exp} />
              </div>
              <div>
                <span>Selisih</span>
                <Money value={monthStats.inc - monthStats.exp} tone="auto" sign="always" />
              </div>
              <div>
                <span>Hari terboros</span>
                <strong>{monthStats.maxDay ? formatDate(monthStats.maxDay) : '—'}</strong>
              </div>
            </div>
            <div className="cal-week">
              {weekDays(weekStart).map((w) => (
                <span key={w.label} className={w.weekend ? 'wkend' : ''}>
                  {w.label}
                </span>
              ))}
            </div>
            <AnimatePresence mode="popLayout" initial={false} custom={dir}>
              <motion.div
                key={month}
                className="cal-grid"
                custom={dir}
                initial={{ opacity: 0, x: dir * 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dir * -30 }}
                transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
              >
                {days.map((d) => {
                  const a = byDay.get(d);
                  const out = !d.startsWith(monthKey);
                  const heat = a && monthStats.maxExp ? Math.sqrt(a.exp / monthStats.maxExp) : 0;
                  const due = dues.get(d);
                  const wk = isWeekend(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      className={['cal-cell', out && 'out', d === today && 'today', d === sel && 'sel', wk && 'wkend'].filter(Boolean).join(' ')}
                      onClick={() => moveSel(d)}
                      onDoubleClick={() => openTx({ date: d })}
                      style={{ '--heat': heat } as React.CSSProperties}
                      aria-label={formatDate(d, 'full')}
                    >
                      <span className="cc-num">{Number(d.slice(8))}</span>
                      {due && (
                        <span className="cc-dues">
                          {due.slice(0, 3).map((x) => (
                            <i key={x.tx.id} className={x.kind} />
                          ))}
                        </span>
                      )}
                      <span className="cc-vals">
                        {a && a.inc > 0 && <span className="pos money-val">+{compactNumber(a.inc)}</span>}
                        {a && a.exp > 0 && <span className="money-val">−{compactNumber(a.exp)}</span>}
                      </span>
                      {a && a.count > 0 && <span className="cc-count">{a.count}</span>}
                    </button>
                  );
                })}
              </motion.div>
            </AnimatePresence>
            <div className="cal-legend">
              <span>
                <i className="heat-sw" /> Intensitas pengeluaran
              </span>
              <span>
                <i className="due-sw payable" /> Jatuh tempo hutang
              </span>
              <span>
                <i className="due-sw receivable" /> Jatuh tempo piutang
              </span>
              <span className="spacer" />
              <span className="muted">
                <span className="kbd">←</span>
                <span className="kbd">→</span> pindah · <span className="kbd">↵</span> catat · <span className="kbd">T</span> hari ini
              </span>
            </div>
          </div>

          <aside className="card cal-side">
            <AnimatePresence mode="wait">
              <motion.div key={sel} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
                <div className="cs-head">
                  <div className="cs-daybig">{Number(sel.slice(8))}</div>
                  <div className="grow">
                    <div className="cs-dname">{DAYS[parseISO(sel).getDay()]}</div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {MONTHS[parseISO(sel).getMonth()]} {sel.slice(0, 4)}
                    </div>
                  </div>
                  {sel === today && <Badge tone="accent">Hari ini</Badge>}
                </div>
                <div className="cs-stats">
                  <div>
                    <span>Masuk</span>
                    <Money value={selAgg?.inc ?? 0} className="pos" />
                  </div>
                  <div>
                    <span>Keluar</span>
                    <Money value={selAgg?.exp ?? 0} />
                  </div>
                </div>

                {selDues.length > 0 && (
                  <div className="cs-section">
                    <div className="label-caps">Jatuh tempo</div>
                    {selDues.map((d) => (
                      <div key={d.tx.id} className="mini-row">
                        <IconTile icon={d.kind === 'payable' ? 'handshake' : 'hand-coins'} color={d.kind === 'payable' ? 'var(--tone-payable)' : 'var(--tone-receivable)'} size="sm" />
                        <span className="col grow" style={{ minWidth: 0 }}>
                          <span className="truncate" style={{ fontWeight: 560, fontSize: 13 }}>
                            {d.kind === 'payable' ? 'Bayar ke' : 'Tagih'} {d.tx.contact}
                          </span>
                          <span className="muted truncate" style={{ fontSize: 12 }}>{d.tx.description}</span>
                        </span>
                        <Money value={d.remaining} />
                      </div>
                    ))}
                  </div>
                )}

                <div className="cs-section">
                  <div className="label-caps">Transaksi</div>
                  {selAgg?.txs.length ? (
                    <div className="tx-list compact-list">
                      {selAgg.txs.map((t) => (
                        <TxRow key={t.id} tx={t} acc={b.acc} parent={t.parentId ? txById.get(t.parentId) : undefined} onOpen={editTx} />
                      ))}
                    </div>
                  ) : (
                    <EmptyState compact icon={Inbox} title="Hari yang tenang" text="Belum ada transaksi pada tanggal ini." />
                  )}
                </div>
                <Button block icon={Plus} onClick={() => openTx({ date: sel })} style={{ marginTop: 12 }}>
                  Catat di {formatDate(sel)}
                </Button>
              </motion.div>
            </AnimatePresence>
          </aside>
        </div>
      ) : (
        <YearView year={Number(month.slice(0, 4))} byDay={byDay} dues={dues} today={today} onPick={(d) => {
          setView('month');
          moveSel(d);
        }} />
      )}
    </div>
  );
}

function YearView({
  year,
  byDay,
  dues,
  today,
  onPick,
}: {
  year: number;
  byDay: Map<string, DayAgg>;
  dues: Map<string, unknown[]>;
  today: string;
  onPick: (d: string) => void;
}) {
  const weekStart = usePrefs((s) => s.weekStart);
  const stats = useMemo(() => {
    let max = 0;
    let inc = 0;
    let exp = 0;
    const perMonth = Array(12).fill(0) as number[];
    for (const [d, a] of byDay) {
      if (!d.startsWith(String(year))) continue;
      max = Math.max(max, a.exp);
      inc += a.inc;
      exp += a.exp;
      perMonth[Number(d.slice(5, 7)) - 1] += a.exp;
    }
    return { max, inc, exp, perMonth };
  }, [byDay, year]);
  const level = (v: number) => (v <= 0 ? 0 : stats.max ? Math.min(4, Math.max(1, Math.ceil(Math.sqrt(v / stats.max) * 4))) : 0);
  return (
    <div className="stack">
      <div className="sum-strip">
        <div>
          <span>Pemasukan {year}</span>
          <Money value={stats.inc} className="pos" />
        </div>
        <div>
          <span>Pengeluaran {year}</span>
          <Money value={stats.exp} />
        </div>
        <div>
          <span>Selisih</span>
          <Money value={stats.inc - stats.exp} tone="auto" sign="always" />
        </div>
        <div>
          <span>Rata-rata / bulan</span>
          <Money value={stats.exp / 12} />
        </div>
      </div>
      <div className="year-grid">
        {MONTHS.map((mn, mi) => {
          const first = `${year}-${String(mi + 1).padStart(2, '0')}-01`;
          const cells = monthMatrix(first, weekStart);
          return (
            <div key={mn} className="card year-month">
              <div className="ym-head">
                <strong>{mn}</strong>
                <span className="muted num money-val">{formatMoney(stats.perMonth[mi], { compact: true })}</span>
              </div>
              <div className="ym-week">
                {weekDays(weekStart, 'letter').map((x, i) => (
                  <span key={i}>{x.label}</span>
                ))}
              </div>
              <div className="ym-grid">
                {cells.map((d) => {
                  const out = d.slice(5, 7) !== first.slice(5, 7);
                  if (out) return <span key={d} className="ym-cell empty" />;
                  const a = byDay.get(d);
                  const lv = level(a?.exp ?? 0);
                  return (
                    <button
                      key={d}
                      type="button"
                      className={`ym-cell lv${lv}${d === today ? ' today' : ''}${dues.has(d) ? ' due' : ''}`}
                      onClick={() => onPick(d)}
                      title={`${formatDate(d, 'full')} · pengeluaran ${a ? formatMoney(a.exp) : 'Rp 0'}`}
                      aria-label={formatDate(d, 'full')}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="cal-legend" style={{ justifyContent: 'flex-end' }}>
        <span className="muted">Lebih sedikit</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <i key={l} className={`ym-cell lv${l}`} style={{ width: 12, height: 12 }} />
        ))}
        <span className="muted">Lebih banyak</span>
      </div>
    </div>
  );
}
