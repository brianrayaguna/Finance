/*
 * Widget inti dasbor (tata letak bawaan): kekayaan bersih, indikator, arus kas, komposisi,
 * transaksi terbaru, dompet, anggaran, hutang-piutang, dan kesehatan keuangan.
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Landmark,
  Handshake,
  HandCoins,
  Target,
  Receipt,
  Coins,
  Wallet,
  ChartLine,
  Layers,
  CreditCard,
  type Glyph,
} from '../../lib/glyphs';
import { useData } from '../../store/data';
import { useUI } from '../../store/ui';
import { budgetVsActual, categoryBreakdown, debtInfos, ratios, walletBalances, type MonthPoint } from '../../accounting/reports';
import { KPI_LABEL, type KpiMetric } from '../../app/dashboardLayout';
import { addMonths, daysBetween, formatDate, formatMoney, formatMonth, formatPercent, formatRatio, isZero, relativeDay, round2, startOfMonth } from '../../lib/format';
import { AnimatedMoney, Badge, Button, EmptyState, IconTile, Money, Progress } from '../ui/primitives';
import { CashflowChart, Donut, TrendArea } from '../charts/Charts';
import { TxRow } from '../tx/TxRow';
import { txFlow } from '../tx/txDisplay';
import { CardHead, Delta, Spark, WCard, shortMoney, trimSeries, useDash, useEmbedded, type DashData } from './common';
import type { WidgetProps } from './types';

/* ───────── Kekayaan bersih ───────── */

export function HeroWidget({ settings }: WidgetProps) {
  const { series, pos, prevPos, prevFrom, compact, startMonth, isCurrent, width } = useDash();
  const range = Number(settings.range) || 12;
  const data = useMemo(() => trimSeries(series.slice(-range), startMonth), [series, range, startMonth]);
  return (
    <div className="card hero-card">
      <div className="hero-top">
        <div style={{ minWidth: 0 }}>
          <h2 className="kpi-label">
            <PiggyBank size={15} aria-hidden /> Kekayaan bersih
          </h2>
          <div className={`hero-value${pos.netWorth < 0 ? ' is-neg' : ''}`}>
            <AnimatedMoney value={pos.netWorth} />
          </div>
          <div className="hero-meta">
            <Delta cur={pos.netWorth} prev={prevPos.netWorth} />
            <span className="muted">
              {isCurrent ? 'sejak akhir' : 'dibanding'} {formatMonth(prevFrom.slice(0, 7))}
            </span>
          </div>
        </div>
        {settings.split !== false && (
          <div className="hero-split">
            <div>
              <span className="muted">Total aset</span>
              <span className="money-val num">{shortMoney(pos.assets, compact)}</span>
            </div>
            <div>
              <span className="muted">Total liabilitas</span>
              <span className="money-val num">{shortMoney(pos.liabilities, compact)}</span>
            </div>
          </div>
        )}
      </div>
      <div className="hero-chart">
        <TrendArea
          data={data.map((s) => ({ label: s.label, full: formatMonth(s.month), nw: s.netWorth }))}
          dataKey="nw"
          height={width < 560 ? 96 : 136}
          label="Kekayaan bersih"
          color="var(--brand-lime)"
          showAxis
          inverse
        />
      </div>
    </div>
  );
}

/* ───────── Indikator utama (4 slot pilihan) ───────── */

type Tone = 'pos' | 'neg' | 'acc' | 'info' | 'warn';

export const KPI_META: Record<KpiMetric, { icon: Glyph; tone: Tone; color: string; to: string }> = {
  income: { icon: TrendingUp, tone: 'pos', color: 'var(--chart-inc)', to: '/laporan?r=laba-rugi' },
  expense: { icon: TrendingDown, tone: 'neg', color: 'var(--chart-exp)', to: '/laporan?r=laba-rugi' },
  net: { icon: Coins, tone: 'acc', color: 'var(--chart-nw)', to: '/laporan?r=laba-rugi' },
  cash: { icon: Landmark, tone: 'info', color: 'var(--info)', to: '/dompet' },
  savingsRate: { icon: PiggyBank, tone: 'pos', color: 'var(--chart-inc)', to: '/laporan?r=rasio' },
  investments: { icon: ChartLine, tone: 'acc', color: 'var(--chart-nw)', to: '/dompet' },
  assets: { icon: Layers, tone: 'info', color: 'var(--info)', to: '/laporan?r=neraca' },
  liabilities: { icon: CreditCard, tone: 'neg', color: 'var(--chart-exp)', to: '/laporan?r=neraca' },
  receivables: { icon: HandCoins, tone: 'info', color: 'var(--info)', to: '/hutang-piutang' },
  budgetLeft: { icon: Target, tone: 'warn', color: 'var(--warn)', to: '/anggaran' },
};

interface KpiValue {
  value: number | null;
  prev: number | null;
  percent?: boolean;
  invert?: boolean;
  spark?: number[];
  foot?: ReactNode;
  /** Keterangan di bawah angka utama (mis. rincian yang membedakannya dari halaman lain) */
  note?: ReactNode;
  /** Pembanding bulan berjalan, mis. "1–2 Sep" (periode yang sama bulan lalu) */
  compare?: string;
}

/** "1–2 Sep": periode bulan lalu yang sebanding dengan bulan berjalan sejauh ini. */
function compareLabel(d: DashData) {
  const day = Number(d.prevEnd.slice(8, 10));
  const mon = formatMonth(d.prevFrom.slice(0, 7), true).replace(/ \d{4}$/, '');
  return `${day > 1 ? `1–${day}` : '1'} ${mon}`;
}

const rate = (m?: MonthPoint) => (m && m.income > 0 ? m.net / m.income : null);

function kpiValue(k: KpiMetric, d: DashData, budget: { budget: number; actual: number; over: number }): KpiValue {
  const s = d.series;
  const cur = s[s.length - 1];
  const last6 = (f: (m: MonthPoint) => number) => s.slice(-6).map(f);
  // Sparkline arus (pendapatan/beban/laba) hanya memakai bulan lengkap: bulan berjalan yang baru sebagian akan tampak seperti anjlok.
  const flowSpark = (f: (m: MonthPoint) => number) => s.filter((m) => !m.partial).slice(-6).map(f);
  const pf = d.prevFlow;
  const compare = d.isCurrent ? compareLabel(d) : undefined;
  // titik terakhir deret posisi memakai posisi per tanggal tampilan agar sama dengan angka utama
  const posSpark = (f: (m: MonthPoint) => number, now: number) => [...last6(f).slice(0, -1), now];
  const invest = (p: DashData['pos']) => p.quickAssets - p.cash - p.receivables;
  switch (k) {
    case 'income':
      return { value: cur.income, prev: pf.income, compare, spark: flowSpark((m) => m.income) };
    case 'expense': {
      // Beban memuat penyusutan & jurnal penyesuaian yang tidak muncul sebagai transaksi — selisih dengan "Pengeluaran" di halaman Transaksi.
      let viaTx = 0;
      for (const t of d.b.data.transactions) if (t.date >= d.from && t.date <= d.asOf) viaTx += txFlow(t).exp;
      const extra = round2(cur.expense - viaTx);
      return {
        value: cur.expense,
        prev: pf.expense,
        invert: true,
        compare,
        spark: flowSpark((m) => m.expense),
        note: extra > 0.5 ? <>Termasuk <span className="money-val">{shortMoney(extra, true)}</span> penyusutan &amp; penyesuaian</> : undefined,
      };
    }
    case 'net': {
      const r = rate(cur);
      return {
        value: cur.net,
        prev: pf.net,
        spark: flowSpark((m) => m.net),
        foot: (
          <span className="kpi-note">
            Tabungan <strong className={r === null ? '' : r >= 0.2 ? 'pos' : r < 0 ? 'neg' : ''}>{r === null ? '—' : formatPercent(r)}</strong>
          </span>
        ),
      };
    }
    case 'cash':
      return { value: d.pos.cash, prev: d.prevPos.cash, spark: posSpark((m) => m.cash, d.pos.cash) };
    case 'savingsRate':
      return { value: rate(cur), prev: pf.income > 0 ? pf.net / pf.income : null, percent: true, compare, spark: flowSpark((m) => rate(m) ?? 0) };
    case 'investments':
      return { value: invest(d.pos), prev: invest(d.prevPos), spark: posSpark((m) => m.investments, invest(d.pos)) };
    case 'assets':
      return { value: d.pos.assets, prev: d.prevPos.assets, spark: posSpark((m) => m.assets, d.pos.assets) };
    case 'liabilities':
      return { value: d.pos.liabilities, prev: d.prevPos.liabilities, invert: true, spark: posSpark((m) => m.liabilities, d.pos.liabilities) };
    case 'receivables':
      return { value: d.pos.receivables, prev: d.prevPos.receivables, spark: posSpark((m) => m.receivables, d.pos.receivables) };
    case 'budgetLeft': {
      if (!(budget.budget > 0))
        return {
          value: null,
          prev: null,
          foot: (
            <Link to="/anggaran" className="kpi-note link">
              Tetapkan anggaran
            </Link>
          ),
        };
      const used = budget.actual / budget.budget;
      return {
        value: budget.budget - budget.actual,
        prev: null,
        foot: (
          <div className="kpi-budget">
            <span className="kpi-note">
              {formatPercent(used, 0)} dari <span className="money-val">{shortMoney(budget.budget, true)}</span>
              {budget.over > 0 && <strong className="neg"> · {budget.over} lewat batas</strong>}
            </span>
            <Progress value={used} thin color={used > 1 ? 'var(--neg)' : used > 0.85 ? 'var(--warn)' : 'var(--accent-ink)'} label="Anggaran terpakai" />
          </div>
        ),
      };
    }
  }
}

export function KpiWidget({ layout }: WidgetProps) {
  const d = useDash();
  const phone = d.width < 560;
  const budget = useMemo(() => {
    const lines = budgetVsActual(d.b, d.from, d.asOf);
    return {
      budget: lines.reduce((s, l) => s + l.budget, 0),
      actual: lines.reduce((s, l) => s + l.actual, 0),
      over: lines.filter((l) => l.used > 1).length,
    };
  }, [d.b, d.from, d.asOf]);
  return (
    <div className="kpi-grid">
      {layout.kpi.map((k) => {
        const meta = KPI_META[k];
        const v = kpiValue(k, d, budget);
        const neg = v.value !== null && v.value < -0.004 && k !== 'liabilities';
        return (
          <div key={k} className="card kpi">
            <h2 className="kpi-label">
              <span className={`kpi-ico ${meta.tone}`}>
                <meta.icon aria-hidden />
              </span>
              {KPI_LABEL[k]}
            </h2>
            <div className={`kpi-value${neg ? ' neg' : ''}`}>
              {v.value === null ? <span className="muted">—</span> : v.percent ? <span className="num">{formatPercent(v.value)}</span> : <AnimatedMoney value={v.value} compact={phone && Math.abs(v.value) >= 1e6} />}
            </div>
            {v.note && <div className="kpi-sub">{v.note}</div>}
            <div className="kpi-foot">
              {v.foot ??
                (v.value !== null && v.prev !== null ? (
                  <span className="kpi-cmp">
                    <Delta cur={v.value} prev={v.prev} invert={v.invert} unit={v.percent ? 'points' : 'money'} compact={d.compact} vs={v.compare ? `periode sama bulan lalu (${v.compare})` : undefined} />
                    {v.compare && <span className="kpi-vs">vs {v.compare}</span>}
                  </span>
                ) : (
                  <span className="delta muted">—</span>
                ))}
              {v.spark && <Spark values={v.spark} color={meta.color} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ───────── Pendapatan & beban ───────── */

export function CashflowWidget({ settings }: WidgetProps) {
  const { series, startMonth } = useDash();
  const embedded = useEmbedded();
  const range = Number(settings.range) || 12;
  const showNet = settings.net !== false;
  const data = useMemo(() => trimSeries(series.slice(-range), startMonth), [series, range, startMonth]);
  return (
    <WCard>
      <div className={`card-head${embedded ? ' embedded' : ''}`}>
        <div className="grow">
          <h2 className={embedded ? 'sr-only' : 'card-title'}>Pendapatan & beban</h2>
          <div className="card-sub">
            {data.length} bulan terakhir ·{' '}
            <span title="Belanja & pemasukan harian dicatat saat uang bergerak. Penyusutan, piutang, dan hutang kredit diakui secara akrual. Bunga pinjaman diakui saat dibayar.">akrual sebagian</span>
            {data[data.length - 1]?.partial ? ' · bulan berjalan sampai hari ini' : ''}
          </div>
        </div>
        <div className="legend" aria-hidden>
          <span>
            <i style={{ background: 'var(--chart-inc)' }} />
            Pendapatan
          </span>
          <span>
            <i style={{ background: 'var(--chart-exp)' }} />
            Beban
          </span>
          {showNet && (
            <span>
              <i className="line" style={{ background: 'var(--chart-net)' }} />
              Laba
            </span>
          )}
        </div>
      </div>
      <div className="card-body" style={{ paddingTop: 10 }}>
        <CashflowChart data={data.map((s) => ({ ...s, full: formatMonth(s.month) + (s.partial ? ' · berjalan' : '') }))} height={264} showNet={showNet} />
      </div>
    </WCard>
  );
}

/* ───────── Komposisi beban / pendapatan ───────── */

const OTHER_ID = '__lainnya';

export function CompositionWidget({ settings }: WidgetProps) {
  const { b, from, asOf, month } = useDash();
  const nav = useNavigate();
  const kind = settings.kind === 'revenue' ? 'revenue' : 'expense';
  const [hoverCat, setHoverCat] = useState<string | null>(null);
  const cats = useMemo(() => categoryBreakdown(b, from, asOf, kind), [b, from, asOf, kind]);
  const word = kind === 'expense' ? 'beban' : 'pendapatan';
  // Lima kategori terbesar; sisanya digabung agar irisan kecil tidak menjadi serpihan yang tak terbaca.
  const slices = useMemo(() => {
    const top = cats.list.slice(0, 5).map((c) => ({ id: c.account.id, name: c.account.name, value: c.value, share: c.share, color: c.account.color }));
    const rest = cats.list.slice(5);
    if (!rest.length) return top;
    return [...top, { id: OTHER_ID, name: `Lainnya (${rest.length})`, value: rest.reduce((s, c) => s + c.value, 0), share: rest.reduce((s, c) => s + c.share, 0), color: 'var(--text-4)' }];
  }, [cats]);
  const h = slices.find((c) => c.id === hoverCat);
  return (
    <WCard>
      <CardHead title={`Komposisi ${word}`} sub={formatMonth(month)} to="/laporan?r=laba-rugi" link="Rinci" />
      <div className="card-body">
        {cats.list.length === 0 ? (
          <EmptyState compact icon={Receipt} title={`Belum ada ${word}`} text={`${kind === 'expense' ? 'Beban' : 'Pendapatan'} bulan ini akan tampil di sini.`} />
        ) : (
          <div className="donut-wrap">
            <Donut
              size={176}
              data={slices}
              onHover={setHoverCat}
              active={hoverCat}
              center={
                <>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {h ? h.name : `Total ${word}`}
                  </span>
                  <strong className="num money-val figure" style={{ fontSize: 18 }}>
                    {formatMoney(h ? h.value : cats.total, { compact: true })}
                  </strong>
                  {h && (
                    <span className="muted" style={{ fontSize: 12 }}>
                      {formatPercent(h.share)}
                    </span>
                  )}
                </>
              }
            />
            <div className="cat-legend">
              {slices.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  className={`cat-leg${hoverCat && hoverCat !== c.id ? ' dim' : ''}`}
                  title={`${c.name} · ${formatMoney(c.value)}`}
                  onMouseEnter={() => setHoverCat(c.id)}
                  onMouseLeave={() => setHoverCat(null)}
                  onFocus={() => setHoverCat(c.id)}
                  onBlur={() => setHoverCat(null)}
                  onClick={() => (c.id === OTHER_ID ? nav('/laporan?r=laba-rugi') : nav(`/transaksi?kategori=${c.id}&bulan=${month}`))}
                >
                  <span className="dot" style={{ '--c': c.color } as CSSProperties} />
                  <span className="truncate grow">{c.name}</span>
                  <span className="num muted">{formatPercent(c.share, 0)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </WCard>
  );
}

/* ───────── Transaksi terbaru ───────── */

export function RecentWidget({ settings }: WidgetProps) {
  const { b, today } = useDash();
  const txCount = useData((s) => s.data.transactions.length);
  const openTx = useUI((s) => s.openTx);
  const editTx = useUI((s) => s.editTx);
  const count = Number(settings.count) || 5;
  const recent = useMemo(
    () =>
      [...b.data.transactions]
        .filter((t) => t.date <= today)
        .sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : y.createdAt - x.createdAt))
        .slice(0, count),
    [b, today, count],
  );
  const txById = useMemo(() => new Map(b.data.transactions.map((t) => [t.id, t])), [b]);
  return (
    <WCard>
      <CardHead title="Transaksi terbaru" sub={`${txCount.toLocaleString('id-ID')} transaksi tercatat`} to="/transaksi" link="Lihat semua" />
      <div className="card-body tx-list compact-list" style={{ paddingTop: 8 }}>
        {recent.length === 0 ? (
          <EmptyState
            compact
            icon={Receipt}
            title="Belum ada transaksi"
            text="Catat pemasukan atau pengeluaran — jurnal dan laporan tersusun otomatis."
            action={
              <Button variant="primary" size="sm" icon={Plus} onClick={() => openTx()}>
                Catat transaksi
              </Button>
            }
          />
        ) : (
          recent.map((t) => <TxRow key={t.id} tx={t} acc={b.acc} parent={t.parentId ? txById.get(t.parentId) : undefined} showDate onOpen={editTx} />)
        )}
      </div>
    </WCard>
  );
}

/* ───────── Dompet & rekening ───────── */

export function WalletsWidget({ settings }: WidgetProps) {
  const { b, asOf } = useDash();
  const hideZero = settings.hideZero === true;
  const wallets = useMemo(
    () => walletBalances(b, asOf).filter((w) => (hideZero ? !isZero(w.balance) : !w.account.archived || !isZero(w.balance))),
    [b, asOf, hideZero],
  );
  const liquid = wallets.reduce((s, w) => s + (w.account.subtype === 'credit_card' ? -w.balance : w.balance), 0);
  return (
    <WCard>
      <CardHead title="Dompet & rekening" sub={`Saldo per ${formatDate(asOf)}`} to="/dompet" link="Kelola" />
      <div className="card-body list-body">
        {wallets.map((w) => {
          const liab = w.account.subtype === 'credit_card';
          const v = liab ? -w.balance : w.balance;
          return (
            <Link key={w.account.id} to={`/buku-besar?akun=${w.account.id}`} className="mini-row">
              <IconTile icon={w.account.icon} color={w.account.color} size="sm" />
              <span className="truncate grow">{w.account.name}</span>
              <Money value={v} className={v < -0.004 ? 'neg' : ''} />
            </Link>
          );
        })}
        {wallets.length <= 1 && (
          <Link to="/dompet" className="dash-empty-row">
            <span className="row" style={{ gap: 8 }}>
              <Wallet size={15} aria-hidden /> Tambahkan rekening bank atau e-wallet
            </span>
            <ChevronRight size={15} aria-hidden />
          </Link>
        )}
        <div className="mini-total">
          <span>Total likuid</span>
          <Money value={liquid} className={liquid < -0.004 ? 'neg' : ''} />
        </div>
      </div>
    </WCard>
  );
}

/* ───────── Anggaran ───────── */

export function BudgetsWidget({ settings }: WidgetProps) {
  const { b, from, to, asOf, month, today, compact } = useDash();
  const nav = useNavigate();
  const count = Number(settings.count) || 5;
  const all = useMemo(() => budgetVsActual(b, from, asOf), [b, from, asOf]);
  const budgets = useMemo(() => {
    const list = settings.sort === 'code' ? [...all].sort((x, y) => x.account.code.localeCompare(y.account.code, 'en', { numeric: true })) : all;
    return list.slice(0, count);
  }, [all, settings.sort, count]);
  const over = all.filter((x) => x.used > 1).length;
  const dayShare = month === today.slice(0, 7) ? Number(today.slice(8)) / Number(to.slice(8)) : 1;
  return (
    <WCard>
      <CardHead
        title="Anggaran bulan ini"
        sub={all.length ? (over ? `${over} kategori melebihi batas` : `${all.length} kategori dalam batas`) : 'Belum ada anggaran'}
        to="/anggaran"
        link="Semua"
      />
      <div className="card-body">
        {budgets.length === 0 ? (
          <EmptyState
            compact
            icon={Target}
            title="Tetapkan anggaran"
            text="Batasi beban per kategori setiap bulan."
            action={
              <Button size="sm" onClick={() => nav('/anggaran')}>
                Buat anggaran
              </Button>
            }
          />
        ) : (
          <div className="stack" style={{ gap: 14 }}>
            {budgets.map((bl) => {
              const color = bl.used > 1 ? 'var(--neg)' : bl.used > 0.85 ? 'var(--warn)' : bl.account.color;
              return (
                <div key={bl.account.id} className="budget-mini">
                  <div className="row">
                    <IconTile icon={bl.account.icon} color={bl.account.color} size="xs" />
                    <span className="truncate grow" style={{ fontSize: 13, fontWeight: 580 }}>
                      {bl.account.name}
                    </span>
                    <span className="num" style={{ fontSize: 13 }}>
                      <span className={`money-val${bl.used > 1 ? ' neg' : ''}`}>{shortMoney(bl.actual, compact)}</span>
                      <span className="muted">
                        {' '}
                        / <span className="money-val">{shortMoney(bl.budget, compact)}</span>
                      </span>
                    </span>
                  </div>
                  <Progress value={bl.used} color={color} thin marker={dayShare} label={`Anggaran ${bl.account.name} terpakai`} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </WCard>
  );
}

/* ───────── Hutang & piutang ───────── */

export function DebtsWidget() {
  const { b, today } = useDash();
  const nav = useNavigate();
  const debts = useMemo(() => debtInfos(b.data, today).filter((d) => d.remaining > 0.005), [b, today]);
  const payableTotal = debts.filter((d) => d.kind === 'payable').reduce((s, d) => s + d.remaining, 0);
  const receivableTotal = debts.filter((d) => d.kind === 'receivable').reduce((s, d) => s + d.remaining, 0);
  const upcoming = debts
    .filter((d) => d.tx.dueDate)
    .sort((x, y) => (x.tx.dueDate! < y.tx.dueDate! ? -1 : 1))
    .slice(0, 3);
  return (
    <WCard>
      <CardHead title="Hutang & piutang" sub="Saldo berjalan" to="/hutang-piutang" link="Detail" />
      <div className="card-body">
        <div className="dp-split">
          <div className="dp-box">
            <span className="kpi-label">
              <Handshake size={14} aria-hidden /> Hutang
            </span>
            <Money value={payableTotal} className="dp-val" />
          </div>
          <div className="dp-box">
            <span className="kpi-label">
              <HandCoins size={14} aria-hidden /> Piutang
            </span>
            <Money value={receivableTotal} className="dp-val" />
          </div>
        </div>
        <div className="label-caps" style={{ margin: '16px 0 6px' }}>
          Jatuh tempo terdekat
        </div>
        {upcoming.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>
            Tidak ada tagihan yang menunggu.
          </div>
        ) : (
          upcoming.map((d) => <DueRow key={d.tx.id} d={d} today={today} onClick={() => nav('/hutang-piutang')} />)
        )}
      </div>
    </WCard>
  );
}

export function DueRow({ d, today, onClick, showKind }: { d: ReturnType<typeof debtInfos>[number]; today: string; onClick: () => void; showKind?: boolean }) {
  const days = daysBetween(today, d.tx.dueDate!);
  return (
    <button type="button" className="mini-row" onClick={onClick}>
      <IconTile icon={d.kind === 'payable' ? 'handshake' : 'hand-coins'} color={d.kind === 'payable' ? 'var(--tone-payable)' : 'var(--tone-receivable)'} size="sm" />
      <span className="col grow" style={{ minWidth: 0, alignItems: 'flex-start' }}>
        <span className="truncate" style={{ fontSize: 13, fontWeight: 580, maxWidth: '100%' }}>
          {d.tx.contact || '—'}
        </span>
        <span className="muted" style={{ fontSize: 12 }}>
          {showKind ? `${d.kind === 'payable' ? 'Bayar hutang' : 'Tagih piutang'} · ` : ''}
          {relativeDay(d.tx.dueDate!, today)}
        </span>
      </span>
      <span className="col" style={{ alignItems: 'flex-end', gap: 3 }}>
        <Money value={d.remaining} />
        <Badge tone={days < 0 ? 'neg' : days <= 7 ? 'warn' : 'default'}>{days < 0 ? `${-days} hari lewat` : days === 0 ? 'Hari ini' : `${days} hari lagi`}</Badge>
      </span>
    </button>
  );
}

/* ───────── Kesehatan keuangan ───────── */

export function HealthWidget() {
  const { b, from, asOf } = useDash();
  const rs = useMemo(() => ratios(b, { from: startOfMonth(addMonths(from, -2)), to: asOf, label: '' }), [b, from, asOf]);
  const pick = (n: string) => rs.find((r) => r.name === n);
  const health = [pick('Tingkat Tabungan'), pick('Cakupan Dana Darurat'), pick('Rasio Hutang terhadap Aset'), pick('Rasio Lancar')].filter(Boolean) as typeof rs;
  return (
    <WCard>
      <CardHead title="Kesehatan keuangan" sub="3 bulan terakhir" to="/laporan?r=rasio" link="Rasio" />
      <div className="card-body">
        <div className="health">
          {health.map((r) => (
            <div key={r.name} className={`health-item st-${r.status}`}>
              <span className="h-dot" />
              <span className="grow">
                <span className="h-name">{r.name}</span>
                <span className="h-bench">Sasaran {r.benchmark}</span>
              </span>
              <strong className="num">{formatRatio(r.value, r.unit)}</strong>
            </div>
          ))}
        </div>
      </div>
    </WCard>
  );
}
