import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Target, Pencil, Trash2, Ellipsis, History, TriangleAlert, CircleCheck, Flame, Flag } from '../lib/glyphs';
import { useBooks, useToday } from '../hooks/useApp';
import { upsertBudget, deleteBudget, useData } from '../store/data';
import { notify } from '../store/history';
import { activity, budgetVsActual, type BudgetLine } from '../accounting/reports';
import { addMonths, endOfMonth, formatMoney, formatMonth, formatPercent, startOfMonth, round2, daysBetween } from '../lib/format';
import { PageHeader } from '../components/layout/Topbar';
import { Badge, Button, EmptyState, Field, IconTile, Money, Progress } from '../components/ui/primitives';
import { MonthSwitcher } from '../components/ui/MonthSwitcher';
import { Menu } from '../components/ui/Popover';
import { Ring } from '../components/charts/Charts';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { AmountInput } from '../components/ui/AmountInput';
import { useCategoryOptions } from '../components/forms/options';
import { GoalRow, useGoalModal } from '../components/goals/GoalModal';
import { goalProgress } from '../accounting/goals';

export default function Budgets() {
  const b = useBooks();
  const today = useToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [edit, setEdit] = useState<{ categoryId?: string; amount?: number } | null>(null);
  const goals = useData((s) => s.data.goals);
  const goalModal = useGoalModal();
  const goalList = useMemo(() => goals.map((g) => goalProgress(b, g, today)), [b, goals, today]);

  const from = month + '-01';
  const to = endOfMonth(from);
  const isCur = month === today.slice(0, 7);
  const totalDays = Number(to.slice(8));
  const elapsed = isCur ? Number(today.slice(8)) : month < today.slice(0, 7) ? totalDays : 0;
  const pace = elapsed / totalDays;
  const daysLeft = isCur ? daysBetween(today, to) + 1 : 0;

  const lines = useMemo(() => budgetVsActual(b, from, to), [b, from, to]);
  const totalBudget = lines.reduce((s, l) => s + l.budget, 0);
  const totalActual = lines.reduce((s, l) => s + l.actual, 0);
  const remaining = totalBudget - totalActual;
  const over = lines.filter((l) => l.used > 1);

  const unbudgeted = useMemo(() => {
    const act = activity(b, from, to);
    const set = new Set(lines.map((l) => l.account.id));
    return b.accounts
      .filter((a) => a.type === 'expense' && !set.has(a.id) && !a.archived)
      .map((a) => ({ a, v: round2((act.get(a.id)?.d ?? 0) - (act.get(a.id)?.c ?? 0)) }))
      .filter((x) => x.v > 0)
      .sort((x, y) => y.v - x.v);
  }, [b, from, to, lines]);

  const status = (l: BudgetLine) => {
    if (l.used > 1) return { tone: 'neg' as const, label: 'Melebihi', icon: Flame, color: 'var(--neg)' };
    if (l.used > Math.max(0.85, pace + 0.1)) return { tone: 'warn' as const, label: 'Waspada', icon: TriangleAlert, color: 'var(--warn)' };
    return { tone: 'pos' as const, label: 'Aman', icon: CircleCheck, color: l.account.color };
  };

  const ringColor = totalBudget && totalActual / totalBudget > 1 ? 'var(--neg)' : totalBudget && totalActual / totalBudget > pace + 0.1 ? 'var(--warn)' : 'var(--bar-accent)';

  return (
    <div>
      <PageHeader
        title="Anggaran"
        subtitle={`Batas beban bulanan per kategori dan target tabungan · ${formatMonth(month)}`}
        actions={
          <>
            <MonthSwitcher value={month} onChange={setMonth} />
            <Button variant="primary" icon={Plus} onClick={() => setEdit({})}>
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
            text="Tetapkan batas pengeluaran bulanan per kategori untuk memantau disiplin belanja Anda."
            action={
              <Button variant="primary" icon={Plus} onClick={() => setEdit({})}>
                Buat anggaran pertama
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="card budget-hero">
            <Ring value={totalBudget ? totalActual / totalBudget : 0} size={132} stroke={12} color={ringColor}>
              <strong className="num figure" style={{ fontSize: 26 }}>{formatPercent(totalBudget ? totalActual / totalBudget : 0, 0)}</strong>
              <span className="muted" style={{ fontSize: 12 }}>terpakai</span>
            </Ring>
            <div className="bh-main">
              <span className="kpi-label">{remaining >= 0 ? 'Sisa anggaran' : 'Melebihi anggaran'}</span>
              <strong className={`bh-val num money-val ${remaining < 0 ? 'neg' : ''}`}>{formatMoney(Math.abs(remaining))}</strong>
              <span className="muted">
                Realisasi <span className="money-val">{formatMoney(totalActual)}</span> dari <span className="money-val">{formatMoney(totalBudget)}</span>
              </span>
              <div className="bh-pace">
                <Progress value={totalBudget ? totalActual / totalBudget : 0} color={ringColor} marker={pace} label="Total anggaran terpakai" />
                <span className="muted" style={{ fontSize: 12 }}>
                  Garis penanda = porsi waktu berjalan ({formatPercent(pace, 0)})
                </span>
              </div>
            </div>
            <div className="bh-side">
              <div>
                <span className="muted">Sisa per hari</span>
                <strong className="num money-val">{isCur && daysLeft > 0 ? formatMoney(Math.floor(Math.max(0, remaining) / daysLeft)) : '—'}</strong>
                <span className="muted" style={{ fontSize: 12 }}>{isCur ? `${daysLeft} hari tersisa` : 'Periode selesai'}</span>
              </div>
              <div>
                <span className="muted">Kategori melebihi</span>
                <strong className={over.length ? 'neg' : 'pos'}>{over.length} dari {lines.length}</strong>
              </div>
            </div>
          </div>

          <div className="budget-grid">
            {lines.map((l, i) => {
              const s = status(l);
              return (
                <motion.div
                  key={l.account.id}
                  className="card budget-card"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: i * 0.03 } }}
                  onClick={() => setEdit({ categoryId: l.account.id, amount: l.budget })}
                  tabIndex={0}
                  aria-label={`Ubah anggaran ${l.account.name}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.target === e.currentTarget) setEdit({ categoryId: l.account.id, amount: l.budget });
                  }}
                >
                  <div className="row">
                    <IconTile icon={l.account.icon} color={l.account.color} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="truncate" style={{ fontWeight: 620 }}>{l.account.name}</div>
                      <Badge tone={s.tone} icon={s.icon}>
                        {s.label}
                      </Badge>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <Menu
                        items={[
                          { label: 'Ubah batas', icon: Pencil, onSelect: () => setEdit({ categoryId: l.account.id, amount: l.budget }) },
                          { separator: true },
                          { label: 'Hapus anggaran', icon: Trash2, danger: true, onSelect: () => l.budgetId && notify(`Anggaran ${l.account.name} dihapus`, deleteBudget(l.budgetId), { tone: 'danger' }) },
                        ]}
                        trigger={(p) => (
                          <button type="button" className="tb-btn" ref={p.ref} onClick={p.onClick} aria-label={`Menu anggaran ${l.account.name}`}>
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
                  <Progress value={l.used} color={s.color} marker={pace} label={`Anggaran ${l.account.name} terpakai`} />
                  <div className="bc-foot">
                    <span className={l.variance < 0 ? 'neg' : 'muted'}>
                      {l.variance >= 0 ? 'Sisa ' : 'Lebih '}
                      <span className="money-val">{formatMoney(Math.abs(l.variance))}</span>
                    </span>
                    <span className="muted num">{formatPercent(l.used, 0)}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </>
      )}

      <section id="target" className="goals-section">
        <div className="section-head">
          <h3>Target tabungan</h3>
          <span className="muted">{goalList.length ? `${goalList.filter((p) => p.status === 'done').length} dari ${goalList.length} tercapai` : 'Kemajuan dari saldo dompet yang ditautkan'}</span>
          <span className="spacer" />
          <Button size="sm" icon={Plus} onClick={goalModal.openNew}>
            Tambah target
          </Button>
        </div>
        {goalList.length === 0 ? (
          <div className="card">
            <EmptyState
              compact
              icon={Flag}
              title="Belum ada target tabungan"
              text="Tetapkan tujuan seperti dana darurat atau liburan, lalu tautkan ke dompet tabungannya. Menabung cukup dengan transfer ke dompet itu."
              action={
                <Button variant="primary" size="sm" icon={Plus} onClick={goalModal.openNew}>
                  Buat target
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
        <section>
          <div className="section-head">
            <h3>Beban tanpa anggaran</h3>
            <span className="muted num money-val">{formatMoney(unbudgeted.reduce((s, x) => s + x.v, 0))}</span>
          </div>
          <div className="card list-body" style={{ padding: 6 }}>
            {unbudgeted.map((x) => (
              <div key={x.a.id} className="mini-row">
                <IconTile icon={x.a.icon} color={x.a.color} size="sm" />
                <span className="grow truncate">{x.a.name}</span>
                <Money value={x.v} />
                <Button size="sm" variant="ghost" icon={Plus} onClick={() => setEdit({ categoryId: x.a.id, amount: Math.ceil(x.v / 50000) * 50000 })}>
                  Anggarkan
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {edit && <BudgetModal initial={edit} onClose={() => setEdit(null)} month={month} />}
      {goalModal.node}
    </div>
  );
}

function BudgetModal({ initial, onClose, month }: { initial: { categoryId?: string; amount?: number }; onClose: () => void; month: string }) {
  const b = useBooks();
  const cats = useCategoryOptions('expense');
  const [cat, setCat] = useState(initial.categoryId ?? '');
  const [amount, setAmount] = useState<number | null>(initial.amount ?? null);
  const [tried, setTried] = useState(false);
  const existing = b.data.budgets.find((x) => x.categoryId === cat);

  const avg = useMemo(() => {
    if (!cat) return 0;
    const from = startOfMonth(addMonths(month + '-01', -3));
    const to = endOfMonth(addMonths(month + '-01', -1));
    const x = activity(b, from, to).get(cat);
    return x ? round2((x.d - x.c) / 3) : 0;
  }, [b, cat, month]);

  const submit = () => {
    setTried(true);
    if (!cat || !amount) return;
    const name = b.acc.get(cat)?.name ?? '';
    notify(`Anggaran ${name} ${formatMoney(amount)}/bulan disimpan`, upsertBudget(cat, amount));
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={existing ? 'Ubah anggaran' : 'Anggaran baru'}
      subtitle="Berlaku untuk setiap bulan"
      footer={
        <>
          <span className="spacer" />
          <Button onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={submit}>
            Simpan
          </Button>
        </>
      }
    >
      <div
        className="stack"
        data-form
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
            e.preventDefault();
            submit();
          }
        }}
      >
        <Field label="Kategori beban" error={tried && !cat && 'Pilih kategori'}>
          <Select value={cat} onChange={setCat} options={cats} placeholder="Pilih kategori…" searchable advance invalid={tried && !cat} />
        </Field>
        <Field label="Batas per bulan" error={tried && !amount && 'Masukkan nominal'}>
          <AmountInput value={amount} onChange={setAmount} invalid={tried && !amount} autoFocus={!!initial.categoryId} />
        </Field>
        {avg > 0 && (
          <button type="button" className="suggest-box" onClick={() => setAmount(Math.ceil(avg / 10000) * 10000)}>
            <History size={15} />
            <span className="grow">
              Rata-rata 3 bulan terakhir <strong className="money-val">{formatMoney(avg)}</strong>
            </span>
            <span className="link">Gunakan</span>
          </button>
        )}
      </div>
    </Modal>
  );
}
