/*
 * Target tabungan: formulir tambah/ubah dan baris kemajuan (dipakai di dasbor & halaman Anggaran).
 * Kemajuan = saldo gabungan dompet yang ditautkan, sehingga tidak ada pencatatan ganda.
 */
import { useId, useMemo, useState } from 'react';
import { Trash2, Check } from 'lucide-react';
import type { Goal } from '../../accounting/types';
import { goalProgress, type GoalProgress, type GoalStatus } from '../../accounting/goals';
import { walletBalances } from '../../accounting/reports';
import { addGoal, deleteGoal, getData, updateGoal } from '../../store/data';
import { confirm } from '../../store/ui';
import { notify } from '../../store/history';
import { useBooks, useToday } from '../../hooks/useApp';
import { formatDate, formatMoney, formatMonth } from '../../lib/format';
import { Modal } from '../ui/Modal';
import { AmountInput } from '../ui/AmountInput';
import { DatePicker } from '../ui/DatePicker';
import { ColorPicker, IconPicker } from '../ui/Pickers';
import { Badge, Button, Field, IconTile, Progress, TextInput } from '../ui/primitives';

const SAVING_SUBTYPES = ['cash', 'bank', 'ewallet', 'investment'];

export const GOAL_STATUS: Record<GoalStatus, { label: string; tone: 'pos' | 'warn' | 'neg' | 'default' | 'info' }> = {
  done: { label: 'Tercapai', tone: 'pos' },
  on_track: { label: 'Sesuai jalur', tone: 'pos' },
  behind: { label: 'Tertinggal', tone: 'warn' },
  overdue: { label: 'Lewat tenggat', tone: 'neg' },
  no_date: { label: 'Tanpa tenggat', tone: 'default' },
  unlinked: { label: 'Belum ditautkan', tone: 'warn' },
};

/** Kalimat keterangan kemajuan target. */
export function goalNote(p: GoalProgress): string {
  const g = p.goal;
  switch (p.status) {
    case 'done':
      return `Terkumpul ${formatMoney(p.current)} dari ${formatMoney(g.target)}`;
    case 'on_track':
    case 'behind': {
      const need = `Perlu ${formatMoney(p.perMonth ?? 0, { compact: true })}/bln hingga ${formatMonth(g.targetDate!.slice(0, 7), true)}`;
      return p.status === 'behind' && p.pace > 0 ? `${need} · kini ${formatMoney(p.pace, { compact: true })}/bln` : need;
    }
    case 'overdue':
      return `Tenggat ${formatDate(g.targetDate!)} terlewat · kurang ${formatMoney(p.remaining)}`;
    case 'no_date':
      return p.projected ? `Dengan laju kini, tercapai sekitar ${formatMonth(p.projected.slice(0, 7))}` : 'Belum ada kenaikan saldo dalam 3 bulan terakhir';
    case 'unlinked':
      return 'Tautkan dompet tabungan agar kemajuan terhitung otomatis';
  }
}

export function GoalRow({ p, onClick }: { p: GoalProgress; onClick?: () => void }) {
  const g = p.goal;
  const st = GOAL_STATUS[p.status];
  const color = p.status === 'done' ? 'var(--pos)' : p.status === 'overdue' ? 'var(--neg)' : g.color;
  return (
    <button type="button" className="goal-row" onClick={onClick} aria-label={`${g.name}: ${Math.round(p.pct * 100)}% — ${st.label}. Ubah target`}>
      <IconTile icon={g.icon} color={g.color} size="sm" />
      <span className="goal-main">
        <span className="goal-top">
          <span className="goal-name truncate">{g.name}</span>
          <span className="num goal-amt">
            <span className="money-val">{formatMoney(p.current, { compact: p.current >= 1e6 })}</span>
            <span className="muted">
              {' / '}
              <span className="money-val">{formatMoney(g.target, { compact: g.target >= 1e6 })}</span>
            </span>
          </span>
        </span>
        <Progress value={p.pct} thin color={color} label={`Kemajuan ${g.name}`} />
        <span className="goal-sub">
          <Badge tone={st.tone === 'default' ? 'default' : st.tone}>{st.label}</Badge>
          <span className="muted truncate">{goalNote(p)}</span>
        </span>
      </span>
    </button>
  );
}

export function GoalModal({ open, onClose, editing }: { open: boolean; onClose: () => void; editing?: Goal }) {
  const b = useBooks();
  const today = useToday();
  const [name, setName] = useState(editing?.name ?? '');
  const [target, setTarget] = useState<number | null>(editing?.target ?? null);
  const [targetDate, setTargetDate] = useState(editing?.targetDate ?? '');
  const [accountIds, setAccountIds] = useState<string[]>(editing?.accountIds ?? []);
  const [icon, setIcon] = useState(editing?.icon ?? 'piggy-bank');
  const [color, setColor] = useState(editing?.color ?? '#4C8A58');
  const [tried, setTried] = useState(false);
  const groupId = useId();

  const wallets = useMemo(
    () => walletBalances(b, today).filter((w) => SAVING_SUBTYPES.includes(w.account.subtype) && (!w.account.archived || accountIds.includes(w.account.id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [b, today],
  );
  const draft: Goal = { id: editing?.id ?? 'draft', name, target: target ?? 0, targetDate: targetDate || undefined, accountIds, icon, color, createdAt: editing?.createdAt ?? 0 };
  const preview = target && target > 0 ? goalProgress(b, draft, today) : null;

  const nameErr = !name.trim() ? 'Nama target wajib diisi' : null;
  const targetErr = !(target && target > 0) ? 'Isi jumlah target' : null;
  const dateErr = targetDate && targetDate <= today && !editing ? 'Tenggat harus setelah hari ini' : null;

  const toggle = (id: string) => setAccountIds((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));

  const submit = () => {
    setTried(true);
    if (nameErr || targetErr || dateErr) return;
    const input = { name: name.trim(), target: target!, targetDate: targetDate || undefined, accountIds, icon, color };
    if (editing) notify(`Target ${input.name} diperbarui`, updateGoal(editing.id, input));
    else notify(`Target ${input.name} dibuat`, addGoal(input));
    onClose();
  };

  const remove = async () => {
    if (!editing) return;
    const ok = await confirm({ title: `Hapus target ${editing.name}?`, message: 'Saldo dompet yang ditautkan tidak berubah — hanya targetnya yang dihapus.', confirmLabel: 'Hapus', tone: 'danger' });
    if (!ok) return;
    notify(`Target ${editing.name} dihapus`, deleteGoal(editing.id), { tone: 'danger' });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Ubah Target Tabungan' : 'Target Tabungan Baru'}
      subtitle="Kemajuan dihitung dari saldo dompet yang ditautkan"
      icon={<IconTile icon={icon} color={color} size="lg" solid />}
      size="lg"
      headerExtra={editing ? <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={remove} aria-label="Hapus target" /> : null}
      footer={
        <>
          <span className="spacer" />
          <Button onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={submit}>
            {editing ? 'Simpan' : 'Buat target'}
          </Button>
        </>
      }
    >
      <div
        className="acc-form"
        data-form
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || (e.target as HTMLElement).tagName === 'INPUT')) {
            e.preventDefault();
            submit();
          }
        }}
      >
        <div className="acc-fields">
          <Field label="Nama target" error={tried && nameErr} className="span-2">
            <TextInput value={name} onChange={setName} placeholder="mis. Dana darurat, Liburan ke Jepang" invalid={tried && !!nameErr} autoFocus data-field />
          </Field>
          <Field label="Jumlah target" error={tried && targetErr}>
            <AmountInput variant="inline" value={target} onChange={setTarget} invalid={tried && !!targetErr} />
          </Field>
          <Field label="Tenggat" optional error={tried && dateErr}>
            <DatePicker value={targetDate} onChange={setTargetDate} clearable placeholder="Tanpa tenggat" compact min={editing ? undefined : today} />
          </Field>
          <div className="field span-2">
            <div className="field-label" id={groupId}>
              Dompet tabungan
            </div>
            <div className="goal-wallets" role="group" aria-labelledby={groupId}>
              {wallets.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Belum ada dompet atau rekening.</div>}
              {wallets.map((w) => {
                const on = accountIds.includes(w.account.id);
                return (
                  <button key={w.account.id} type="button" role="checkbox" aria-checked={on} className={`gw${on ? ' on' : ''}`} onClick={() => toggle(w.account.id)}>
                    <IconTile icon={w.account.icon} color={w.account.color} size="xs" />
                    <span className="truncate grow">{w.account.name}</span>
                    <span className="money-val num muted">{formatMoney(w.balance, { compact: Math.abs(w.balance) >= 1e6 })}</span>
                    <span className="gw-check" aria-hidden>
                      {on && <Check />}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="field-hint">Menabung cukup dengan transfer ke dompet ini — jurnal tetap berpasangan, tanpa pencatatan ganda.</div>
          </div>
          {preview && (
            <div className="goal-preview span-2">
              <GoalRow p={preview} />
            </div>
          )}
          <Field label="Warna" className="span-2">
            <ColorPicker value={color} onChange={setColor} />
          </Field>
        </div>
        <Field label="Ikon">
          <IconPicker value={icon} color={color} onChange={setIcon} />
        </Field>
      </div>
    </Modal>
  );
}

export function useGoalModal() {
  const [state, setState] = useState<{ open: boolean; editing?: Goal; key: number }>({ open: false, key: 0 });
  const openNew = () => setState((s) => ({ open: true, key: s.key + 1 }));
  const openEdit = (g: Goal) => setState((s) => ({ open: true, editing: getData().goals.find((x) => x.id === g.id) ?? g, key: s.key + 1 }));
  const node = <GoalModal key={state.key} open={state.open} onClose={() => setState((s) => ({ ...s, open: false }))} editing={state.editing} />;
  return { openNew, openEdit, node };
}
