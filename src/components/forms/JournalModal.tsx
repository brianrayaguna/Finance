import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Trash2, Scale, CircleCheck, CircleAlert, Wand2, X, Lock } from 'lucide-react';
import type { JournalLineInput, Transaction } from '../../accounting/types';
import { isLocked } from '../../accounting/lock';
import { addTransaction, deleteTransactions, updateTransaction, useData } from '../../store/data';
import { confirm } from '../../store/ui';
import { notify } from '../../store/history';
import { addDays, formatDate, formatMoney, round2, todayISO, uid, isZero, nowTime } from '../../lib/format';
import { focusNext } from '../../lib/focus';
import { MOD } from '../../lib/layers';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { DatePicker } from '../ui/DatePicker';
import { AmountInput } from '../ui/AmountInput';
import { Badge, Button, Field, Kbd, Switch, TextInput } from '../ui/primitives';
import { useAccountOptions } from './options';

interface Line extends JournalLineInput {
  key: string;
}

const blank = (): Line => ({ key: uid('l'), accountId: '', debit: 0, credit: 0, memo: '' });

export function JournalModal({
  open,
  onClose,
  editing,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  editing?: Transaction;
  defaults?: Partial<Transaction>;
}) {
  const src = editing ?? defaults;
  const [date, setDate] = useState(src?.date ?? todayISO());
  const [description, setDescription] = useState(src?.description ?? '');
  const [adjusting, setAdjusting] = useState(!!src?.adjusting);
  const [lines, setLines] = useState<Line[]>(() =>
    src?.lines?.length ? src.lines.map((l) => ({ ...l, key: uid('l') })) : [blank(), blank()],
  );
  const [tried, setTried] = useState(false);
  const accountOptions = useAccountOptions(undefined, editing?.lines?.map((l) => l.accountId));
  const bodyRef = useRef<HTMLDivElement>(null);
  const lockDate = useData((s) => s.data.profile.lockDate);
  const lockedEdit = !!editing && isLocked(editing.date, lockDate);
  const dateLocked = !lockedEdit && isLocked(date, lockDate);

  const totals = useMemo(() => {
    const d = round2(lines.reduce((s, l) => s + (l.debit || 0), 0));
    const c = round2(lines.reduce((s, l) => s + (l.credit || 0), 0));
    return { d, c, diff: round2(d - c) };
  }, [lines]);

  const valid = lines.filter((l) => l.accountId && (l.debit || l.credit));
  const balanced = isZero(totals.diff) && totals.d > 0;
  const error = dateLocked
    ? `Periode sampai ${formatDate(lockDate!)} sudah dikunci`
    : !valid.length
    ? 'Isi minimal dua baris jurnal'
    : valid.length < 2
      ? 'Jurnal membutuhkan minimal dua akun'
      : !balanced
        ? `Jurnal belum seimbang — selisih ${formatMoney(Math.abs(totals.diff))}`
        : lines.some((l) => (l.debit || l.credit) && !l.accountId)
          ? 'Ada baris bernominal tanpa akun'
          : null;

  const update = (key: string, patch: Partial<Line>) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const n = { ...l, ...patch };
        if (patch.debit) n.credit = 0;
        if (patch.credit) n.debit = 0;
        return n;
      }),
    );

  const addLine = (focus = true) => {
    const nl = blank();
    // saran otomatis: sisi yang kurang
    if (!isZero(totals.diff)) {
      if (totals.diff > 0) nl.credit = totals.diff;
      else nl.debit = -totals.diff;
    }
    setLines((ls) => [...ls, nl]);
    if (focus)
      requestAnimationFrame(() => {
        const rows = bodyRef.current?.querySelectorAll<HTMLElement>('.jl-row');
        rows?.[rows.length - 1]?.querySelector<HTMLElement>('.select-trigger')?.focus();
      });
  };

  const autoBalance = () => {
    if (isZero(totals.diff)) return;
    const target = [...lines].reverse().find((l) => l.accountId && !l.debit && !l.credit) ?? lines[lines.length - 1];
    if (!target) return;
    const others = lines.filter((l) => l.key !== target.key);
    const od = others.reduce((s, l) => s + (l.debit || 0), 0);
    const oc = others.reduce((s, l) => s + (l.credit || 0), 0);
    const diff = round2(od - oc);
    update(target.key, diff > 0 ? { credit: diff, debit: 0 } : { debit: -diff, credit: 0 });
  };

  const submit = () => {
    if (lockedEdit) return;
    setTried(true);
    if (error) return;
    const payload = {
      type: 'journal' as const,
      date,
      time: editing?.time ?? nowTime(),
      amount: totals.d,
      description: description.trim() || (adjusting ? 'Jurnal penyesuaian' : 'Jurnal umum'),
      adjusting,
      lines: valid.map(({ accountId, debit, credit, memo }) => ({ accountId, debit: round2(debit || 0), credit: round2(credit || 0), memo: memo?.trim() || undefined })),
    };
    if (editing) {
      const hid = updateTransaction(editing.id, payload, 'Ubah jurnal');
      if (!hid) return;
      notify('Jurnal diperbarui', hid);
    } else {
      const { tx, historyId } = addTransaction(payload, adjusting ? 'Tambah jurnal penyesuaian' : 'Tambah jurnal umum');
      if (!historyId) return;
      notify(`Jurnal ${formatMoney(totals.d)} diposting`, historyId, { detail: tx.ref });
    }
    onClose();
  };

  const remove = async () => {
    if (!editing) return;
    const ok = await confirm({ title: 'Hapus jurnal ini?', message: `${editing.ref} akan dihapus dari buku besar.`, confirmLabel: 'Hapus', tone: 'danger' });
    if (!ok) return;
    const hid = deleteTransactions([editing.id], 'Hapus jurnal');
    if (!hid) return;
    notify('Jurnal dihapus', hid, { tone: 'danger' });
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      const t = e.target as HTMLElement;
      if (t.tagName !== 'INPUT') return;
      e.preventDefault();
      // `.jl-row:last-of-type` tidak pernah cocok karena .jl-foot adalah div terakhir → ambil baris terakhir secara eksplisit.
      const rows = bodyRef.current?.querySelectorAll('.jl-row');
      const isLastRow = !!rows?.length && t.closest('.jl-row') === rows[rows.length - 1];
      if (isLastRow && t.closest('.jl-credit')) {
        if (balanced) submit();
        else addLine();
        return;
      }
      if (!focusNext(t)) submit();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? 'Ubah Jurnal' : 'Jurnal Umum Baru'}
      subtitle={editing ? editing.ref : 'Posting jurnal manual dengan debit dan kredit seimbang'}
      headerExtra={editing && !lockedEdit ? <Button variant="danger-ghost" size="sm" icon={Trash2} onClick={remove}>Hapus</Button> : null}
      footer={
        lockedEdit ? (
          <>
            <span className="spacer" />
            <Button variant="primary" onClick={onClose}>
              Tutup
            </Button>
          </>
        ) : (
          <>
            <span className="hint">
              <Kbd>↵</Kbd> berikutnya · <Kbd>{MOD}</Kbd><Kbd>↵</Kbd> posting
            </span>
            <span className="spacer" />
            <Button onClick={onClose}>Batal</Button>
            <Button variant="primary" onClick={submit} disabled={tried && !!error}>
              {editing ? 'Simpan perubahan' : 'Posting jurnal'}
            </Button>
          </>
        )
      }
    >
      {lockedEdit && (
        <div className="lock-note" role="status">
          <Lock aria-hidden />
          <span>
            Periode sampai <strong>{formatDate(lockDate!, 'long')}</strong> sudah dikunci, jadi jurnal ini hanya dapat dilihat. Buka kunci di Pengaturan › Profil &amp; buku untuk mengubahnya.
          </span>
        </div>
      )}
      <div data-form onKeyDown={onKey} ref={bodyRef} inert={lockedEdit || undefined}>
        <div className="jm-top">
          <Field label="Tanggal" error={tried && dateLocked ? `Periode sampai ${formatDate(lockDate!)} sudah dikunci` : undefined}>
            <DatePicker value={date} onChange={setDate} advance min={lockDate && !lockedEdit ? addDays(lockDate, 1) : undefined} />
          </Field>
          <Field label="Keterangan" className="grow">
            <TextInput value={description} onChange={setDescription} placeholder="mis. Penyesuaian beban dibayar di muka" data-field />
          </Field>
          <label className="jm-adj">
            <Switch checked={adjusting} onChange={setAdjusting} label="Jurnal penyesuaian" />
            <span>
              <strong>Penyesuaian</strong>
              <span className="muted">Masuk kolom penyesuaian neraca lajur</span>
            </span>
          </label>
        </div>

        <div className="jl-table">
          <div className="jl-head">
            <span>Akun</span>
            <span>Memo</span>
            <span className="r">Debit</span>
            <span className="r">Kredit</span>
            <span />
          </div>
          <AnimatePresence initial={false}>
            {lines.map((l) => (
              <motion.div
                key={l.key}
                className="jl-row"
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, transition: { duration: 0.15 } }}
              >
                <div className={l.credit ? 'jl-acc indent' : 'jl-acc'}>
                  <Select
                    value={l.accountId}
                    onChange={(v) => update(l.key, { accountId: v })}
                    options={accountOptions}
                    placeholder="Pilih akun…"
                    searchable
                    advance
                    width={340}
                    invalid={tried && !l.accountId && !!(l.debit || l.credit)}
                  />
                </div>
                <TextInput value={l.memo ?? ''} onChange={(v) => update(l.key, { memo: v })} placeholder="—" aria-label="Memo baris" data-field />
                <div className="jl-debit">
                  <AmountInput variant="inline" value={l.debit || null} onChange={(v) => update(l.key, { debit: v ?? 0 })} ariaLabel="Debit" />
                </div>
                <div className="jl-credit">
                  <AmountInput variant="inline" value={l.credit || null} onChange={(v) => update(l.key, { credit: v ?? 0 })} ariaLabel="Kredit" />
                </div>
                <button
                  type="button"
                  className="jl-del"
                  aria-label="Hapus baris"
                  tabIndex={-1}
                  disabled={lines.length <= 2}
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                >
                  <X size={14} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
          <div className="jl-foot">
            <div className="row" style={{ gap: 6 }}>
              <Button size="sm" variant="ghost" icon={Plus} onClick={() => addLine()}>
                Tambah baris
              </Button>
              {!isZero(totals.diff) && (
                <Button size="sm" variant="tinted" icon={Wand2} onClick={autoBalance}>
                  Seimbangkan
                </Button>
              )}
            </div>
            <span className="r num strong">{formatMoney(totals.d, { symbol: false })}</span>
            <span className="r num strong">{formatMoney(totals.c, { symbol: false })}</span>
            <span />
          </div>
        </div>

        <div className={`jm-status ${balanced ? 'ok' : 'bad'}`}>
          {balanced ? <CircleCheck size={16} /> : <Scale size={16} />}
          <span className="grow">
            {balanced ? 'Debit dan kredit seimbang' : `Selisih ${formatMoney(Math.abs(totals.diff))} di sisi ${totals.diff > 0 ? 'kredit' : 'debit'}`}
          </span>
          {tried && error && (
            <Badge tone="neg" icon={CircleAlert}>
              {error}
            </Badge>
          )}
        </div>
      </div>
    </Modal>
  );
}
