import { useMemo, useState } from 'react';
import { enter } from '../lib/motion';
import {
  CircleCheck,
  Ellipsis,
  Eye,
  Flag,
  Flame,
  Handshake,
  History,
  Info,
  Pencil,
  Plus,
  Target,
  Trash2,
  TriangleAlert,
} from '../lib/glyphs';
import { useBooks, useMediaQuery, useToday } from '../hooks/useApp';
import { deleteBudget, upsertBudget, useData } from '../store/data';
import { notify } from '../store/history';
import { activity } from '../accounting/reports';
import {
  budgetStatus,
  budgetSummary,
  budgetThreeMonthAverage,
  budgetVsActual,
  type BudgetLine,
  type DebtBudgetLine,
  type ExpenseBudgetLine,
} from '../accounting/budgets';
import type { BudgetKind, BudgetTarget } from '../accounting/types';
import { daysBetween, endOfMonth, formatMoney, formatMonth, formatPercent, round2 } from '../lib/format';
import { useSubmitRef } from '../lib/focus';
import { isImeComposing } from '../lib/layers';
import { PageHeader } from '../components/layout/Topbar';
import { Badge, Button, EmptyState, Field, IconTile, Money, Progress } from '../components/ui/primitives';
import { MonthSwitcher } from '../components/ui/MonthSwitcher';
import { Menu } from '../components/ui/Popover';
import { Ring } from '../components/charts/Charts';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { Segmented } from '../components/ui/Segmented';
import { AmountInput } from '../components/ui/AmountInput';
import { useCategoryOptions, usePayableBudgetOptions } from '../components/forms/options';
import { GoalRow, useGoalModal } from '../components/goals/GoalModal';
import { goalProgress } from '../accounting/goals';
import { BudgetBreakdownSheet } from '../components/budgets/BudgetBreakdownSheet';

interface EditDraft {
  kind?: BudgetKind;
  categoryId?: string;
  debtId?: string;
  amount?: number;
  lockedKind?: boolean;
}

const STATUS_META = {
  over: { tone: 'neg' as const, label: 'Melebihi', icon: Flame },
  warn: { tone: 'warn' as const, label: 'Waspada', icon: TriangleAlert },
  safe: { tone: 'pos' as const, label: 'Aman', icon: CircleCheck },
};

export default function Budgets() {
  const b = useBooks();
  const today = useToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [edit, setEdit] = useState<EditDraft | null>(null);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const goals = useData((s) => s.data.goals);
  const goalModal = useGoalModal();
  const phone = useMediaQuery('(max-width: 760px)');
  const goalList = useMemo(() => goals.map((g) => goalProgress(b, g, today)), [b, goals, today]);

  const currentMonth = today.slice(0, 7);
  const from = `${month}-01`;
  const to = endOfMonth(from);
  const isCur = month === currentMonth;
  const isFuture = month > currentMonth;
  const actualTo = isCur ? today : to;
  const totalDays = Number(to.slice(8));
  const elapsed = isCur ? Number(today.slice(8)) : isFuture ? 0 : totalDays;
  const pace = elapsed / totalDays;
  const daysLeft = isCur ? daysBetween(today, to) + 1 : 0;

  const lines = useMemo(() => budgetVsActual(b, from, to, actualTo), [b, from, to, actualTo]);
  const expLines = useMemo(() => lines.filter((l): l is ExpenseBudgetLine => l.kind === 'expense'), [lines]);
  const debtLines = useMemo(() => lines.filter((l): l is DebtBudgetLine => l.kind === 'debt'), [lines]);
  const sum = useMemo(() => budgetSummary(lines), [lines]);
  const detailLine = useMemo(() => (detailKey ? lines.find((l) => l.key === detailKey) ?? null : null), [lines, detailKey]);

  const unbudgeted = useMemo(() => {
    const act = activity(b, from, actualTo);
    const set = new Set(expLines.map((l) => l.categoryId));
    return b.accounts
      .filter((a) => a.type === 'expense' && !set.has(a.id) && !a.archived)
      .map((a) => ({ a, v: round2((act.get(a.id)?.d ?? 0) - (act.get(a.id)?.c ?? 0)) }))
      .filter((x) => x.v > 0)
      .sort((x, y) => y.v - x.v);
  }, [b, from, actualTo, expLines]);

  const openEditFor = (l: BudgetLine) => {
    if (l.kind === 'debt') {
      setEdit({ kind: 'debt', debtId: l.debtId ?? '__all__', amount: l.budget, lockedKind: true });
    } else {
      setEdit({ kind: 'expense', categoryId: l.categoryId, amount: l.budget, lockedKind: true });
    }
  };

  const removeBudget = (l: BudgetLine) => {
    const hid = deleteBudget(l.budgetId);
    if (hid) {
      if (detailKey === l.key) setDetailKey(null);
      notify(`Anggaran ${l.label} dihapus`, hid, { tone: 'danger' });
    }
  };

  const totalUsed = sum.totalBudget ? sum.totalActual / sum.totalBudget : 0;
  const ringColor =
    sum.totalBudget && totalUsed > 1
      ? 'var(--neg)'
      : sum.totalBudget && totalUsed > pace + 0.1
        ? 'var(--warn)'
        : 'var(--bar-accent)';

  const renderCard = (l: BudgetLine, i: number) => {
    const st = budgetStatus(l.used, pace);
    const sm = STATUS_META[st];
    const barColor = st === 'over' ? 'var(--neg)' : st === 'warn' ? 'var(--warn)' : l.color;
    const paidInactive = l.kind === 'debt' && !l.activeInPeriod;

    return (
      <div key={l.key} className={`card budget-card${paidInactive ? ' is-inactive' : ''}`} {...enter(i)}>
        <div className="row bc-head">
          <IconTile icon={l.icon} color={l.color} />
          <div className="grow bc-meta">
            <div className="bc-title">
              <button
                type="button"
                className="stretch-trigger truncate"
                aria-label={`Lihat rincian anggaran ${l.label}`}
                onClick={() => setDetailKey(l.key)}
              >
                {l.label}
              </button>
            </div>
            {l.sublabel && <div className="bc-sub muted truncate">{l.sublabel}</div>}
            <div className="bc-badges">
              {l.kind === 'debt' && l.isPaidOff ? (
                <Badge tone="pos" icon={CircleCheck}>
                  Lunas
                </Badge>
              ) : (
                <Badge tone={sm.tone} icon={sm.icon}>
                  {sm.label}
                </Badge>
              )}
              {l.kind === 'debt' && !l.debtId && <Badge>Semua hutang</Badge>}
            </div>
          </div>
          <div className="row-front">
            <Menu
              items={[
                { label: 'Lihat rincian', icon: Eye, onSelect: () => setDetailKey(l.key) },
                { label: 'Ubah batas', icon: Pencil, onSelect: () => openEditFor(l) },
                { separator: true },
                {
                  label: 'Hapus anggaran',
                  icon: Trash2,
                  danger: true,
                  onSelect: () => removeBudget(l),
                },
              ]}
              trigger={(p) => (
                <button
                  type="button"
                  className="tb-btn"
                  ref={p.ref}
                  onClick={p.onClick}
                  aria-expanded={p['aria-expanded']}
                  aria-haspopup={p['aria-haspopup']}
                  aria-label={`Menu anggaran ${l.label}`}
                >
                  <Ellipsis />
                </button>
              )}
            />
          </div>
        </div>
        <div className="bc-amounts">
          <Money value={l.actual} className="bc-actual" />
          <span className="muted">
            / <span className="money-val">{formatMoney(l.budget)}</span>
          </span>
        </div>
        <Progress value={l.used} color={barColor} marker={pace} label={`Anggaran ${l.label} terpakai`} />
        <div className="bc-foot">
          <span className={l.variance < 0 ? 'neg' : 'muted'}>
            {l.variance >= 0 ? 'Sisa ' : 'Lebih '}
            <span className="money-val">{formatMoney(Math.abs(l.variance))}</span>
          </span>
          <span className="muted num">{formatPercent(l.used, 0)}</span>
        </div>
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Anggaran"
        subtitle={`Batas pengeluaran, pembayaran hutang, dan target tabungan, ${formatMonth(month)}`}
        actions={
          <>
            <MonthSwitcher value={month} onChange={setMonth} className="ms-stretch" />
            <Button variant="primary" icon={Plus} collapse onClick={() => setEdit({})}>
              Tambah anggaran
            </Button>
          </>
        }
      />

      {lines.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Target}
            title="Belum ada anggaran"
            text="Tetapkan batas pengeluaran per kategori atau anggaran pembayaran hutang bulanan, lalu pantau rinciannya di sini."
            action={
              <Button variant="primary" icon={Plus} onClick={() => setEdit({})}>
                Tambah anggaran
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {sum.activeCount > 0 && (
            <div className="card budget-hero">
              <Ring value={totalUsed} size={phone ? 96 : 132} stroke={phone ? 10 : 12} color={ringColor}>
                <strong className="num figure bh-ring-pct">{formatPercent(totalUsed, 0)}</strong>
                <span className="muted bh-ring-cap">terpakai</span>
              </Ring>
              <div className="bh-main">
                <span className="kpi-label">{sum.remaining >= 0 ? 'Sisa anggaran' : 'Melebihi anggaran'}</span>
                <strong className={`bh-val num money-val${sum.remaining < 0 ? ' neg' : ''}`}>
                  {formatMoney(Math.abs(sum.remaining))}
                </strong>
                <span className="muted">
                  Terpakai <span className="money-val">{formatMoney(sum.totalActual)}</span> dari{' '}
                  <span className="money-val">{formatMoney(sum.totalBudget)}</span>
                </span>
                {sum.hasExpense && sum.hasDebt && (
                  <span className="muted bh-split">
                    Pengeluaran <span className="money-val">{formatMoney(sum.expenseActual)}</span> · Pembayaran hutang{' '}
                    <span className="money-val">{formatMoney(sum.debtActual)}</span>
                  </span>
                )}
                <div className="bh-pace">
                  <Progress value={totalUsed} color={ringColor} marker={pace} label="Total anggaran terpakai" />
                  <span className="muted bh-hint">Garis penanda waktu berjalan {formatPercent(pace, 0)}</span>
                </div>
              </div>
              <div className="bh-side">
                <div>
                  <span className="muted">Sisa per hari</span>
                  <strong className="num money-val">
                    {isCur && daysLeft > 0 ? formatMoney(Math.floor(Math.max(0, sum.remaining) / daysLeft)) : '—'}
                  </strong>
                  <span className="muted bh-hint">
                    {isCur ? `${daysLeft} hari tersisa` : isFuture ? 'Periode mendatang' : 'Periode selesai'}
                  </span>
                </div>
                <div>
                  <span className="muted">{sum.hasDebt ? 'Anggaran melebihi' : 'Kategori melebihi'}</span>
                  <strong className={sum.overCount ? 'neg' : 'pos'}>
                    {sum.overCount} dari {sum.activeCount}
                  </strong>
                </div>
              </div>
            </div>
          )}

          {expLines.length > 0 && (
            <section className="budget-section">
              {debtLines.length > 0 && (
                <div className="section-head">
                  <div className="sh-text">
                    <h2>Anggaran pengeluaran</h2>
                    <span className="muted">
                      <span className="money-val">{formatMoney(sum.expenseActual)}</span> dari{' '}
                      <span className="money-val">{formatMoney(sum.expenseBudget)}</span>
                    </span>
                  </div>
                </div>
              )}
              <div className="budget-grid">{expLines.map((l, i) => renderCard(l, i))}</div>
            </section>
          )}

          {debtLines.length > 0 && (
            <section className="budget-section">
              <div className="section-head">
                <div className="sh-text">
                  <h2>Anggaran pembayaran hutang</h2>
                  <span className="muted">
                    Pokok &amp; bunga · <span className="money-val">{formatMoney(sum.debtActual)}</span> dari{' '}
                    <span className="money-val">{formatMoney(sum.debtBudget)}</span>
                  </span>
                </div>
                <Button size="sm" icon={Handshake} collapse onClick={() => setEdit({ kind: 'debt' })}>
                  Tambah anggaran hutang
                </Button>
              </div>
              {sum.specificExceedsAggregate && (
                <div className="note-box" style={{ marginTop: 0, marginBottom: 14 }}>
                  <Info size={16} style={{ flex: 'none', marginTop: 2 }} />
                  <span>
                    Jumlah batas per hutang melebihi batas “Semua pembayaran hutang”. Total ringkasan di atas tetap memakai batas keseluruhan agar tidak terhitung ganda.
                  </span>
                </div>
              )}
              <div className="budget-grid">{debtLines.map((l, i) => renderCard(l, i))}</div>
            </section>
          )}
        </>
      )}

      <section id="target" className="goals-section">
        <div className="section-head">
          <div className="sh-text">
            <h2>Target tabungan</h2>
            <span className="muted">
              {goalList.length
                ? `${goalList.filter((p) => p.status === 'done').length} dari ${goalList.length} tercapai`
                : 'Dihitung dari saldo dompet yang ditautkan'}
            </span>
          </div>
          <Button size="sm" icon={Plus} collapse onClick={goalModal.openNew}>
            Tambah target
          </Button>
        </div>
        {goalList.length === 0 ? (
          <div className="card">
            <EmptyState
              compact
              heading="h3"
              icon={Flag}
              title="Belum ada target tabungan"
              text="Tetapkan tujuan seperti dana darurat atau liburan, lalu tautkan ke dompet tabungannya. Menabung cukup dengan transfer ke dompet itu."
              action={
                <Button variant="primary" size="sm" icon={Plus} onClick={goalModal.openNew}>
                  Tambah target
                </Button>
              }
            />
          </div>
        ) : (
          <div className="goal-cards">
            {goalList.map((p) => (
              <div key={p.goal.id} className="card goal-card">
                <GoalRow p={p} onClick={() => goalModal.openEdit(p.goal)} />
              </div>
            ))}
          </div>
        )}
      </section>

      {unbudgeted.length > 0 && (
        <section className="budget-section">
          <div className="section-head">
            <h2>Pengeluaran tanpa anggaran</h2>
            <span className="muted num money-val">{formatMoney(unbudgeted.reduce((s, x) => s + x.v, 0))}</span>
          </div>
          <div className="card list-body" style={{ padding: 6 }}>
            {unbudgeted.map((x) => (
              <div key={x.a.id} className="mini-row">
                <IconTile icon={x.a.icon} color={x.a.color} size="sm" />
                <span className="grow truncate">{x.a.name}</span>
                <Money value={x.v} />
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Plus}
                  onClick={() =>
                    setEdit({ kind: 'expense', categoryId: x.a.id, amount: Math.ceil(x.v / 50000) * 50000 })
                  }
                >
                  Anggarkan
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <BudgetBreakdownSheet
        line={detailLine}
        b={b}
        month={month}
        from={from}
        actualTo={actualTo}
        isCurrent={isCur}
        pace={pace}
        onClose={() => setDetailKey(null)}
        onEdit={(l) => {
          setDetailKey(null);
          openEditFor(l);
        }}
        onDelete={removeBudget}
      />

      {edit && <BudgetModal initial={edit} onClose={() => setEdit(null)} month={month} />}
      {goalModal.node}
    </div>
  );
}

function BudgetModal({ initial, onClose, month }: { initial: EditDraft; onClose: () => void; month: string }) {
  const b = useBooks();
  const [kind, setKind] = useState<BudgetKind>(initial.kind ?? 'expense');
  const [cat, setCat] = useState(initial.categoryId ?? '');
  const [debtChoice, setDebtChoice] = useState(initial.debtId ?? '__all__');
  const [amount, setAmount] = useState<number | null>(initial.amount ?? null);
  const [tried, setTried] = useState(false);

  const cats = useCategoryOptions('expense', initial.categoryId ? [initial.categoryId] : undefined);
  const debtInclude = initial.debtId && initial.debtId !== '__all__' ? initial.debtId : undefined;
  const debtOpts = usePayableBudgetOptions(debtInclude);

  const selectedDebtId = kind === 'debt' && debtChoice !== '__all__' ? debtChoice : undefined;
  const selectedDebtTx = useMemo(
    () => (selectedDebtId ? b.data.transactions.find((t) => t.id === selectedDebtId) : undefined),
    [b, selectedDebtId],
  );

  const target: BudgetTarget | null =
    kind === 'debt'
      ? { kind: 'debt', debtId: selectedDebtId }
      : cat
        ? { kind: 'expense', categoryId: cat }
        : null;

  const existing = useMemo(() => {
    if (!target) return undefined;
    return b.data.budgets.find((x) =>
      target.kind === 'debt'
        ? x.kind === 'debt' && (x.debtId ?? '') === (target.debtId ?? '')
        : x.kind !== 'debt' && x.categoryId === target.categoryId,
    );
  }, [b.data.budgets, target]);

  const avg = useMemo(() => {
    if (!target) return { average: 0, activeMonths: 0 };
    return budgetThreeMonthAverage(b, target, month);
  }, [b, target, month]);

  const submit = () => {
    setTried(true);
    if (!target || !amount) return;
    const label =
      target.kind === 'debt'
        ? target.debtId
          ? selectedDebtTx?.contact || 'Pembayaran hutang'
          : 'Semua pembayaran hutang'
        : b.acc.get(target.categoryId)?.name ?? '';
    const hid = upsertBudget(target, amount);
    if (!hid) return;
    notify(`Anggaran ${label} ${formatMoney(amount)}/bulan disimpan`, hid);
    onClose();
  };
  const submitRef = useSubmitRef(submit);

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={existing ? 'Ubah anggaran' : 'Anggaran baru'}
      subtitle="Berlaku setiap bulan"
      footer={
        <>
          <span className="spacer" />
          <Button onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={() => submitRef.run()}>
            Simpan
          </Button>
        </>
      }
    >
      <div
        className="stack"
        data-form
        onKeyDown={(e) => {
          if (!isImeComposing(e) && e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
            e.preventDefault();
            submitRef.runFrom(e.target);
          }
        }}
      >
        {!initial.lockedKind && (
          <Field label="Jenis anggaran">
            <Segmented
              value={kind}
              onChange={(v) => {
                setKind(v);
                setTried(false);
              }}
              options={[
                { value: 'expense', label: 'Pengeluaran' },
                { value: 'debt', label: 'Pembayaran hutang' },
              ]}
            />
          </Field>
        )}

        {kind === 'expense' ? (
          <Field label="Kategori pengeluaran" error={tried && !cat && 'Pilih kategori'}>
            <Select
              value={cat}
              onChange={setCat}
              options={cats}
              placeholder="Pilih kategori…"
              searchable
              advance
              invalid={tried && !cat}
            />
          </Field>
        ) : (
          <Field
            label="Cakupan pembayaran hutang"
            hint="Menghitung cicilan pokok dan bunga yang dibayar setiap bulan."
          >
            <Select
              value={debtChoice}
              onChange={setDebtChoice}
              options={debtOpts}
              placeholder="Pilih cakupan hutang…"
              searchable
              advance
            />
          </Field>
        )}

        {kind === 'debt' && selectedDebtTx?.counter === 'category' && (
          <div className="note-box" style={{ marginTop: 0 }}>
            <Info size={16} style={{ flex: 'none', marginTop: 2 }} />
            <span>
              Hutang ini berasal dari pembelian kredit (bebannya sudah tercatat saat transaksi awal). Anggaran ini memantau arus kas pelunasannya.
            </span>
          </div>
        )}

        <Field label="Batas per bulan" error={tried && !amount && 'Masukkan nominal'}>
          <AmountInput
            value={amount}
            onChange={setAmount}
            invalid={tried && !amount}
            autoFocus={!!(initial.categoryId || initial.debtId)}
          />
        </Field>

        {avg.average > 0 && (
          <button
            type="button"
            className="suggest-box"
            onClick={() => setAmount(Math.ceil(avg.average / 10000) * 10000)}
          >
            <History size={15} />
            <span className="grow">
              {avg.activeMonths < 3
                ? `Rata-rata ${avg.activeMonths} bulan aktif terakhir `
                : 'Rata-rata 3 bulan terakhir '}
              <strong className="money-val">{formatMoney(avg.average)}</strong>
            </span>
            <span className="link">Gunakan</span>
          </button>
        )}
      </div>
    </Modal>
  );
}
