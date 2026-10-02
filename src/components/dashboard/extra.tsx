/*
 * Widget tambahan yang dapat dipasang dari galeri: jatuh tempo, kategori teratas, peta panas
 * pengeluaran, transaksi favorit, target tabungan, saldo kas harian, wawasan, dan integritas buku.
 */
import { useMemo, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  CalendarClock,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Flag,
  Info,
  Lightbulb,
  Plus,
  ShieldCheck,
  Star,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useUI, usePrefs } from '../../store/ui';
import { useData, deleteTemplate } from '../../store/data';
import { notify } from '../../store/history';
import { cashSeries, categoryBreakdown, dailyExpense, debtInfos } from '../../accounting/reports';
import { buildInsights, type InsightTone } from '../../accounting/insights';
import { checkIntegrity } from '../../accounting/integrity';
import { goalProgress } from '../../accounting/goals';
import type { TxTemplate } from '../../accounting/types';
import { addDays, addMonths, daysBetween, endOfMonth, formatDate, formatMoney, formatMonth, formatPercent, isZero, round2 } from '../../lib/format';
import { monthMatrix, weekDays } from '../../lib/week';
import { Button, EmptyState, IconTile, Money } from '../ui/primitives';
import { TrendArea } from '../charts/Charts';
import { runTemplate, templateReady } from '../tx/templates';
import { GoalRow, useGoalModal } from '../goals/GoalModal';
import { CardHead, WCard, shortMoney, useDash } from './common';
import { DueRow } from './core';
import type { WidgetProps } from './types';

/* ───────── Jatuh tempo ───────── */

export function UpcomingWidget({ settings }: WidgetProps) {
  const { b, today } = useDash();
  const nav = useNavigate();
  const horizon = Number(settings.days) || 30;
  const withRec = settings.receivables !== false;
  const list = useMemo(
    () =>
      debtInfos(b.data, today)
        .filter((d) => d.remaining > 0.005 && d.tx.dueDate && daysBetween(today, d.tx.dueDate) <= horizon && (withRec || d.kind === 'payable'))
        .sort((x, y) => (x.tx.dueDate! < y.tx.dueDate! ? -1 : 1)),
    [b, today, horizon, withRec],
  );
  const pay = round2(list.filter((d) => d.kind === 'payable').reduce((s, d) => s + d.remaining, 0));
  const rec = round2(list.filter((d) => d.kind === 'receivable').reduce((s, d) => s + d.remaining, 0));
  return (
    <WCard>
      <CardHead title="Jatuh tempo" sub={`${horizon} hari ke depan, termasuk yang terlewat`} to="/hutang-piutang" link="Semua" />
      <div className="card-body list-body">
        {list.length === 0 ? (
          <EmptyState compact icon={CalendarClock} title="Tidak ada tagihan" text={`Tidak ada hutang${withRec ? ' atau piutang' : ''} yang jatuh tempo dalam ${horizon} hari.`} />
        ) : (
          <>
            {list.slice(0, 6).map((d) => (
              <DueRow key={d.tx.id} d={d} today={today} showKind={withRec} onClick={() => nav('/hutang-piutang')} />
            ))}
            {list.length > 6 && <div className="w-more">+{list.length - 6} tagihan lainnya</div>}
            <div className="mini-total">
              <span>{withRec ? 'Keluar · masuk' : 'Total dibayar'}</span>
              <span className="num">
                <span className="money-val">{formatMoney(pay)}</span>
                {withRec && (
                  <>
                    <span className="muted"> · </span>
                    <span className="money-val pos">{formatMoney(rec)}</span>
                  </>
                )}
              </span>
            </div>
          </>
        )}
      </div>
    </WCard>
  );
}

/* ───────── Kategori teratas ───────── */

export function TopCatsWidget({ settings }: WidgetProps) {
  const { b, from, asOf, prevFrom, prevTo, isCurrent, month, compact } = useDash();
  const nav = useNavigate();
  const count = Number(settings.count) || 5;
  const cur = useMemo(() => categoryBreakdown(b, from, asOf, 'expense'), [b, from, asOf]);
  // bulan berjalan dibandingkan dengan rentang tanggal yang sama pada bulan lalu
  const prevEnd = isCurrent ? addMonths(asOf, -1) : prevTo;
  const prev = useMemo(() => new Map(categoryBreakdown(b, prevFrom, prevEnd, 'expense').list.map((c) => [c.account.id, c.value])), [b, prevFrom, prevEnd]);
  const top = cur.list.slice(0, count);
  const max = top[0]?.value ?? 0;
  return (
    <WCard>
      <CardHead title="Kategori teratas" sub={`${formatMonth(month)} · dibanding ${isCurrent ? 'periode sama' : 'bulan'} sebelumnya`} to="/laporan?r=laba-rugi" link="Rinci" />
      <div className="card-body">
        {top.length === 0 ? (
          <EmptyState compact icon={Star} title="Belum ada pengeluaran" text="Kategori dengan beban terbesar akan tampil di sini." />
        ) : (
          <div className="topcats">
            {top.map((c) => {
              const p = prev.get(c.account.id) ?? 0;
              const diff = c.value - p;
              const up = diff > 0;
              const flat = !isZero(p) && Math.abs(diff) / p < 0.005;
              return (
                <button key={c.account.id} type="button" className="tc-row" onClick={() => nav(`/transaksi?kategori=${c.account.id}&bulan=${month}`)}>
                  <IconTile icon={c.account.icon} color={c.account.color} size="sm" />
                  <span className="tc-main">
                    <span className="tc-top">
                      <span className="truncate grow">{c.account.name}</span>
                      <span className="money-val num">{shortMoney(c.value, compact)}</span>
                    </span>
                    <span className="tc-bar" aria-hidden>
                      <span style={{ width: `${max ? (c.value / max) * 100 : 0}%`, '--c': c.account.color } as CSSProperties} />
                    </span>
                  </span>
                  <span
                    className={`tc-delta ${isZero(p) || flat ? 'new' : up ? 'bad' : 'good'}`}
                    title={isZero(p) ? 'Tidak ada pada periode pembanding' : flat ? 'Sama dengan periode pembanding' : `${up ? 'Naik' : 'Turun'} ${formatMoney(Math.abs(diff))}`}
                  >
                    {isZero(p) ? (
                      'Baru'
                    ) : flat ? (
                      'Tetap'
                    ) : (
                      <>
                        {up ? <ArrowUpRight aria-hidden /> : <ArrowDownRight aria-hidden />}
                        {formatPercent(Math.abs(diff) / p, 0)}
                      </>
                    )}
                  </span>
                </button>
              );
            })}
            <div className="tc-foot muted">
              {formatPercent(top.reduce((s, c) => s + c.share, 0), 0)} dari total beban <span className="money-val">{shortMoney(cur.total, compact)}</span>
            </div>
          </div>
        )}
      </div>
    </WCard>
  );
}

/* ───────── Peta panas pengeluaran ───────── */

export function HeatmapWidget() {
  const { b, month, from, today, compact } = useDash();
  const weekStart = usePrefs((s) => s.weekStart);
  const nav = useNavigate();
  const to = endOfMonth(from);
  const byDay = useMemo(() => dailyExpense(b, from, to), [b, from, to]);
  const cells = useMemo(() => monthMatrix(from, weekStart), [from, weekStart]);
  const max = Math.max(0, ...byDay.values());
  const lastDay = to < today ? to : today;
  const elapsed = from > today ? 0 : daysBetween(from, lastDay) + 1;
  let noSpend = 0;
  for (let i = 0; i < elapsed; i++) if (!byDay.get(addDays(from, i))) noSpend++;
  const total = [...byDay.values()].reduce((s, v) => s + v, 0);
  // hanya 5 baris bila bulan muat
  const rows = cells.slice(35).some((d) => d.startsWith(month)) ? 6 : 5;
  const lvl = (v: number) => (v <= 0 || !max ? 0 : Math.max(1, Math.ceil(Math.sqrt(v / max) * 4)));
  return (
    <WCard>
      <CardHead
        title="Kalender pengeluaran"
        sub={
          <>
            <span className="money-val">{shortMoney(total, compact)}</span> · {noSpend} hari tanpa belanja
          </>
        }
        to="/transaksi?tampil=kalender"
        link="Kalender"
      />
      <div className="card-body">
        <div className="hm">
          <div className="hm-week" aria-hidden>
            {weekDays(weekStart, 'letter').map((w, i) => (
              <span key={i} className={w.weekend ? 'wkend' : ''}>
                {w.label}
              </span>
            ))}
          </div>
          <div className="hm-grid" role="group" aria-label={`Pengeluaran harian ${formatMonth(month)}`}>
            {cells.slice(0, rows * 7).map((d) => {
              if (!d.startsWith(month)) return <span key={d} className="hm-cell out" aria-hidden />;
              const v = byDay.get(d) ?? 0;
              const future = d > today;
              return (
                <button
                  key={d}
                  type="button"
                  className={`hm-cell lv${lvl(v)}${d === today ? ' today' : ''}${future ? ' future' : ''}`}
                  onClick={() => nav(`/transaksi?tampil=kalender&tanggal=${d}`)}
                  title={`${formatDate(d, 'full')} · ${v ? formatMoney(v) : 'tidak ada pengeluaran'}`}
                  aria-label={`${formatDate(d, 'full')}, pengeluaran ${formatMoney(v)}`}
                >
                  {Number(d.slice(8))}
                </button>
              );
            })}
          </div>
          <div className="hm-legend" aria-hidden>
            <span>Sedikit</span>
            {[0, 1, 2, 3, 4].map((l) => (
              <i key={l} className={`hm-cell lv${l}`} />
            ))}
            <span>Banyak</span>
          </div>
        </div>
      </div>
    </WCard>
  );
}

/* ───────── Transaksi favorit ───────── */

function templateIcon(t: TxTemplate, acc: Map<string, { icon: string; color: string }>) {
  if (t.type === 'transfer') return { icon: ArrowLeftRight, color: 'var(--info)' };
  const c = t.categoryId ? acc.get(t.categoryId) : undefined;
  return { icon: c?.icon ?? (t.type === 'income' ? 'trending-up' : 'receipt'), color: c?.color ?? (t.type === 'income' ? 'var(--pos)' : 'var(--text-3)') };
}

export function FavoritesWidget() {
  const { b } = useDash();
  const templates = useData((s) => s.data.templates);
  const openTx = useUI((s) => s.openTx);
  const remove = (t: TxTemplate) => notify(`Favorit ${t.name} dihapus`, deleteTemplate(t.id), { tone: 'danger' });
  return (
    <WCard>
      <CardHead
        title="Transaksi favorit"
        sub={templates.length ? 'Sekali klik untuk mencatat hari ini' : undefined}
        actions={
          templates.length ? (
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => openTx()}>
              Baru
            </Button>
          ) : undefined
        }
      />
      <div className="card-body">
        {templates.length === 0 ? (
          <EmptyState
            compact
            icon={Star}
            title="Belum ada favorit"
            text="Saat mencatat transaksi rutin (kopi, ojek, isi saldo), pilih “Simpan ke favorit” agar bisa dicatat dengan sekali klik."
            action={
              <Button size="sm" icon={Plus} onClick={() => openTx()}>
                Catat transaksi
              </Button>
            }
          />
        ) : (
          <div className="fav-grid">
            {templates.map((t) => {
              const ic = templateIcon(t, b.acc);
              const ready = templateReady(t);
              return (
                <div key={t.id} className="fav">
                  <button type="button" className="fav-btn" onClick={() => runTemplate(t)} title={ready ? `Catat ${t.name} hari ini` : `Buka formulir ${t.name}`}>
                    <IconTile icon={ic.icon} color={ic.color} size="sm" />
                    <span className="fav-text">
                      <span className="fav-name truncate">{t.name}</span>
                      <span className="fav-amt">{t.amount ? <span className="money-val">{formatMoney(t.amount)}</span> : <span className="muted">Isi nominal</span>}</span>
                    </span>
                  </button>
                  <button type="button" className="fav-del" onClick={() => remove(t)} aria-label={`Hapus favorit ${t.name}`} title="Hapus favorit">
                    <X aria-hidden />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </WCard>
  );
}

/* ───────── Target tabungan ───────── */

export function GoalsWidget() {
  const { b, today } = useDash();
  const goals = useData((s) => s.data.goals);
  const gm = useGoalModal();
  const list = useMemo(() => goals.map((g) => goalProgress(b, g, today)), [b, goals, today]);
  return (
    <WCard>
      <CardHead
        title="Target tabungan"
        sub={list.length ? `${list.filter((p) => p.status === 'done').length} dari ${list.length} tercapai` : undefined}
        actions={
          <Button size="sm" variant="ghost" icon={Plus} onClick={() => gm.openNew()}>
            Target
          </Button>
        }
      />
      <div className="card-body">
        {list.length === 0 ? (
          <EmptyState compact icon={Flag} title="Belum ada target" text="Tetapkan tujuan seperti dana darurat atau liburan, lalu tautkan ke dompet tabungannya." />
        ) : (
          <div className="goal-list">
            {list.map((p) => (
              <GoalRow key={p.goal.id} p={p} onClick={() => gm.openEdit(p.goal)} />
            ))}
          </div>
        )}
      </div>
      {gm.node}
    </WCard>
  );
}

/* ───────── Saldo kas harian ───────── */

export function DailyCashWidget({ settings }: WidgetProps) {
  const { b, asOf, compact } = useDash();
  const days = Number(settings.range) || 60;
  const data = useMemo(() => cashSeries(b, days, asOf), [b, days, asOf]);
  const first = data[0];
  const last = data[data.length - 1];
  const low = data.reduce((m, d) => (d.balance < m.balance ? d : m), data[0]);
  const inflow = data.reduce((s, d) => s + d.inflow, 0);
  const outflow = data.reduce((s, d) => s + d.outflow, 0);
  const change = last.balance - (first.balance - first.inflow + first.outflow);
  return (
    <WCard>
      <CardHead title="Saldo kas harian" sub={`${days} hari terakhir · kas, bank & e-wallet`} to="/dompet" link="Dompet" />
      <div className="card-body">
        <div className="dc-stats">
          <div>
            <span>Saldo akhir</span>
            <strong className={`money-val num${last.balance < 0 ? ' neg' : ''}`}>{shortMoney(last.balance, compact)}</strong>
          </div>
          <div>
            <span>Perubahan</span>
            <strong className={`money-val num ${change > 0.004 ? 'pos' : change < -0.004 ? 'neg' : ''}`}>{shortMoney(change, compact, { sign: 'always' })}</strong>
          </div>
          <div>
            <span>Masuk · keluar</span>
            <strong className="num">
              <span className="money-val">{shortMoney(inflow, compact)}</span>
              <span className="muted"> · </span>
              <span className="money-val">{shortMoney(outflow, compact)}</span>
            </strong>
          </div>
          <div>
            <span>Titik terendah</span>
            <strong className={`money-val num${low.balance < 0 ? ' neg' : ''}`} title={formatDate(low.date, 'long')}>
              {shortMoney(low.balance, compact)}
            </strong>
          </div>
        </div>
        <TrendArea
          data={data.map((d) => ({ label: formatDate(d.date).replace(/ \d{4}$/, ''), full: formatDate(d.date, 'full'), bal: d.balance }))}
          dataKey="bal"
          height={150}
          label="Saldo kas"
          color="var(--info)"
          showAxis
        />
      </div>
    </WCard>
  );
}

/* ───────── Wawasan ───────── */

const INSIGHT_ICON: Record<InsightTone, typeof Info> = { neg: TriangleAlert, warn: CircleAlert, pos: CircleCheck, info: Info };

export function InsightsWidget({ settings }: WidgetProps) {
  const { b, month, today } = useDash();
  const count = Number(settings.count) || 5;
  const list = useMemo(() => buildInsights(b, month, today, count), [b, month, today, count]);
  return (
    <WCard>
      <CardHead title="Wawasan" sub={formatMonth(month)} />
      <div className="card-body">
        {list.length === 0 ? (
          <EmptyState compact icon={Lightbulb} title="Belum ada sorotan" text="Wawasan muncul setelah ada cukup transaksi untuk dibandingkan." />
        ) : (
          <ul className="insights">
            {list.map((i) => {
              const I = INSIGHT_ICON[i.tone];
              const body = (
                <>
                  <span className={`ins-ico ${i.tone}`}>
                    <I aria-hidden />
                  </span>
                  <span className="grow">{i.text}</span>
                  {i.to && <ChevronRight className="ins-chev" aria-hidden />}
                </>
              );
              return (
                <li key={i.id}>
                  {i.to ? (
                    <Link to={i.to} className="ins">
                      {body}
                    </Link>
                  ) : (
                    <div className="ins">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </WCard>
  );
}

/* ───────── Integritas buku ───────── */

export function IntegrityWidget() {
  const { b } = useDash();
  const { issues, debit, credit, entries } = useMemo(() => {
    let d = 0;
    let c = 0;
    for (const e of b.entries)
      for (const l of e.lines) {
        d += l.debit;
        c += l.credit;
      }
    return { issues: checkIntegrity(b.data), debit: round2(d), credit: round2(c), entries: b.entries.length };
  }, [b]);
  const errors = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');
  const balanced = isZero(debit - credit);
  const ok = balanced && errors.length === 0;
  return (
    <WCard>
      <CardHead title="Integritas buku" sub={`${entries.toLocaleString('id-ID')} jurnal · ${b.data.transactions.length.toLocaleString('id-ID')} transaksi`} to="/pengaturan#integritas" link="Periksa" />
      <div className="card-body">
        <div className={`integ-status ${ok ? (warns.length ? 'warn' : 'ok') : 'bad'}`}>
          {ok ? <ShieldCheck aria-hidden /> : <TriangleAlert aria-hidden />}
          <div>
            <strong>{ok ? (warns.length ? 'Seimbang, ada catatan' : 'Buku seimbang') : 'Perlu diperiksa'}</strong>
            <span>
              {errors.length} galat · {warns.length} peringatan
            </span>
          </div>
        </div>
        <div className="integ-rows">
          <div>
            <span>Total debit</span>
            <Money value={debit} />
          </div>
          <div>
            <span>Total kredit</span>
            <Money value={credit} />
          </div>
          <div>
            <span>Selisih</span>
            <strong className={`num ${balanced ? 'pos' : 'neg'}`}>{balanced ? 'Rp 0 — seimbang' : formatMoney(debit - credit)}</strong>
          </div>
        </div>
        {issues.length > 0 && (
          <ul className="integ-issues">
            {issues.slice(0, 2).map((i, k) => (
              <li key={k} className={i.level}>
                {i.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </WCard>
  );
}
