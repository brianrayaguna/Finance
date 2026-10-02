import { useMemo, useState } from 'react';
import { Trash2, Archive, ArchiveRestore } from 'lucide-react';
import { SUBTYPE_META, WALLET_PRESETS, WALLET_SUBTYPES, TYPE_LABEL, nextCode } from '../../accounting/coa';
import type { Account, AccountSubtype, AccountType } from '../../accounting/types';
import {
  accountUsage,
  addAccount,
  createWallet,
  deleteAccount,
  getData,
  updateAccount,
  updateWallet,
  useData,
} from '../../store/data';
import { confirm } from '../../store/ui';
import { notify } from '../../store/history';
import { todayISO } from '../../lib/format';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { AmountInput } from '../ui/AmountInput';
import { DatePicker } from '../ui/DatePicker';
import { ColorPicker, IconPicker } from '../ui/Pickers';
import { Button, Field, IconTile, TextInput } from '../ui/primitives';

export type AccountKind = 'wallet' | 'category' | 'account';

const CATEGORY_SUBTYPES: AccountSubtype[] = ['operating_revenue', 'other_revenue', 'cogs', 'operating_expense', 'other_expense'];
const ALL_SUBTYPES = Object.keys(SUBTYPE_META).filter((s) => s !== 'income_summary') as AccountSubtype[];

export function AccountModal({
  open,
  onClose,
  kind,
  editing,
  defaultSubtype,
}: {
  open: boolean;
  onClose: () => void;
  kind: AccountKind;
  editing?: Account;
  defaultSubtype?: AccountSubtype;
}) {
  const accounts = useData((s) => s.data.accounts);
  const existingOpening = useData((s) => (editing ? s.data.transactions.find((t) => t.type === 'opening' && t.accountId === editing.id) : undefined));
  const initialSub: AccountSubtype = editing?.subtype ?? defaultSubtype ?? (kind === 'wallet' ? 'bank' : kind === 'category' ? 'operating_expense' : 'other_current_asset');
  const preset = WALLET_PRESETS.find((p) => p.subtype === initialSub);
  const [name, setName] = useState(editing?.name ?? '');
  const [subtype, setSubtype] = useState<AccountSubtype>(initialSub);
  const [code, setCode] = useState(editing?.code ?? '');
  const [icon, setIcon] = useState(editing?.icon ?? preset?.icon ?? (initialSub.includes('revenue') ? 'trending-up' : 'tag'));
  const [color, setColor] = useState(editing?.color ?? preset?.color ?? '#4C8A58');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [opening, setOpening] = useState<number | null>(existingOpening?.amount ?? null);
  const [openingDate, setOpeningDate] = useState(existingOpening?.date ?? todayISO());
  const [tried, setTried] = useState(false);
  const [iconTouched, setIconTouched] = useState(!!editing);

  const subtypeOptions = useMemo(() => {
    let list: AccountSubtype[];
    if (kind === 'wallet') list = WALLET_SUBTYPES;
    else if (kind === 'category') list = CATEGORY_SUBTYPES;
    else list = ALL_SUBTYPES;
    if (editing) list = list.filter((s) => SUBTYPE_META[s].type === editing.type);
    return list.map((s) => ({ value: s, label: SUBTYPE_META[s].label, group: TYPE_LABEL[SUBTYPE_META[s].type] }));
  }, [kind, editing]);

  const duplicateName = accounts.some((a) => a.id !== editing?.id && a.name.trim().toLowerCase() === name.trim().toLowerCase());
  const duplicateCode = !!code.trim() && accounts.some((a) => a.id !== editing?.id && a.code === code.trim());
  const nameErr = !name.trim() ? 'Nama wajib diisi' : duplicateName ? 'Nama sudah dipakai akun lain' : null;
  const codeErr = duplicateCode ? 'Kode sudah dipakai' : null;
  const suggestedCode = editing ? editing.code : nextCode(accounts, subtype);
  const title =
    kind === 'wallet' ? (editing ? 'Ubah Dompet' : 'Dompet / Rekening Baru') : kind === 'category' ? (editing ? 'Ubah Kategori' : 'Kategori Baru') : editing ? 'Ubah Akun' : 'Akun Baru';

  const onSubtype = (s: AccountSubtype) => {
    setSubtype(s);
    if (!iconTouched) {
      const p = WALLET_PRESETS.find((x) => x.subtype === s);
      if (p) {
        setIcon(p.icon);
        setColor(p.color);
      }
    }
  };

  const submit = () => {
    setTried(true);
    if (nameErr || codeErr) return;
    const type: AccountType = SUBTYPE_META[subtype].type;
    if (editing) {
      const patch = { name: name.trim(), subtype, type, icon, color, description: description.trim() || undefined, code: code.trim() || editing.code };
      // Dompet: akun + saldo awal disimpan dalam satu langkah riwayat agar "Urungkan" membatalkan keduanya.
      const hid =
        kind === 'wallet'
          ? updateWallet(editing.id, patch, { amount: opening ?? 0, date: openingDate }, `Ubah ${name.trim()}`)
          : updateAccount(editing.id, patch, `Ubah ${name.trim()}`);
      if (!hid) return; // ditolak kunci periode (saldo awal di periode tertutup)
      notify(`${name.trim()} diperbarui`, hid);
    } else if (kind === 'wallet') {
      const { historyId } = createWallet({ name: name.trim(), subtype, icon, color, description: description.trim() || undefined, opening: opening ?? 0, openingDate });
      if (!historyId) return;
      notify(`${name.trim()} ditambahkan`, historyId);
    } else {
      const { historyId } = addAccount({ name: name.trim(), subtype, type, icon, color, description: description.trim() || undefined, code: code.trim() || undefined });
      notify(`${kind === 'category' ? 'Kategori' : 'Akun'} ${name.trim()} ditambahkan`, historyId);
    }
    onClose();
  };

  const toggleArchive = () => {
    if (!editing) return;
    const hid = updateAccount(editing.id, { archived: !editing.archived }, editing.archived ? 'Aktifkan akun' : 'Arsipkan akun');
    notify(editing.archived ? `${editing.name} diaktifkan kembali` : `${editing.name} diarsipkan`, hid);
    onClose();
  };

  const remove = async () => {
    if (!editing) return;
    const used = accountUsage(editing.id);
    if (used > 0) {
      const ok = await confirm({
        title: 'Akun sedang digunakan',
        message: `${editing.name} dipakai oleh ${used} transaksi atau data lain sehingga tidak dapat dihapus tanpa merusak jurnal. Arsipkan agar tersembunyi dari pilihan?`,
        confirmLabel: 'Arsipkan',
      });
      if (ok) toggleArchive();
      return;
    }
    const ok = await confirm({ title: `Hapus ${editing.name}?`, message: 'Akun akan dihapus dari bagan akun.', confirmLabel: 'Hapus', tone: 'danger' });
    if (!ok) return;
    const hid = deleteAccount(editing.id);
    if (!hid) return;
    notify(`${editing.name} dihapus`, hid, { tone: 'danger' });
    onClose();
  };

  const isLiabilityWallet = subtype === 'credit_card';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={`${SUBTYPE_META[subtype].label} · ${TYPE_LABEL[SUBTYPE_META[subtype].type]} · saldo normal ${['asset', 'expense'].includes(SUBTYPE_META[subtype].type) && subtype !== 'accum_depreciation' ? 'debit' : 'kredit'}`}
      icon={<IconTile icon={icon} color={color} size="lg" solid />}
      size="lg"
      headerExtra={
        editing && !editing.system ? (
          <div className="row" style={{ gap: 4 }}>
            <Button size="sm" variant="ghost" icon={editing.archived ? ArchiveRestore : Archive} onClick={toggleArchive}>
              {editing.archived ? 'Aktifkan' : 'Arsipkan'}
            </Button>
            <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={remove} aria-label="Hapus" />
          </div>
        ) : null
      }
      footer={
        <>
          <span className="spacer" />
          <Button onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={submit}>
            {editing ? 'Simpan' : 'Tambahkan'}
          </Button>
        </>
      }
    >
      <div
        className="acc-form"
        data-form
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
            e.preventDefault();
            submit();
          }
        }}
      >
        <div className="acc-fields">
          <Field label="Nama" error={tried && nameErr}>
            <TextInput value={name} onChange={setName} placeholder={kind === 'wallet' ? 'mis. Bank BCA' : kind === 'category' ? 'mis. Kopi & Camilan' : 'Nama akun'} invalid={tried && !!nameErr} autoFocus data-field />
          </Field>
          <Field label="Jenis">
            <Select value={subtype} onChange={onSubtype} options={subtypeOptions} disabled={!!editing?.system} />
          </Field>
          {kind !== 'wallet' && (
            <Field label="Kode akun" hint={!code ? `Otomatis: ${suggestedCode}` : undefined} error={codeErr}>
              <TextInput value={code} onChange={setCode} placeholder={suggestedCode} invalid={!!codeErr} data-field className="num" />
            </Field>
          )}
          {kind === 'wallet' && (
            <>
              <Field label={isLiabilityWallet ? 'Tagihan awal (terutang)' : 'Saldo awal'} optional hint="Dijurnal terhadap Ekuitas Saldo Awal">
                <AmountInput variant="inline" value={opening} onChange={setOpening} placeholder="0" allowNegative />
              </Field>
              <Field label="Per tanggal">
                <DatePicker value={openingDate} onChange={setOpeningDate} compact />
              </Field>
            </>
          )}
          <Field label="Deskripsi" optional className="span-2">
            <TextInput value={description} onChange={setDescription} placeholder="Catatan singkat" data-field />
          </Field>
          <Field label="Warna" className="span-2">
            <ColorPicker value={color} onChange={setColor} />
          </Field>
        </div>
        <Field label="Ikon">
          <IconPicker
            value={icon}
            color={color}
            onChange={(v) => {
              setIcon(v);
              setIconTouched(true);
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}

export function useAccountModal() {
  const [state, setState] = useState<{ open: boolean; kind: AccountKind; editing?: Account; defaultSubtype?: AccountSubtype; key: number }>({
    open: false,
    kind: 'wallet',
    key: 0,
  });
  const openNew = (kind: AccountKind, defaultSubtype?: AccountSubtype) => setState((s) => ({ open: true, kind, defaultSubtype, key: s.key + 1 }));
  const openEdit = (kind: AccountKind, editing: Account) => setState((s) => ({ open: true, kind, editing: getData().accounts.find((a) => a.id === editing.id) ?? editing, key: s.key + 1 }));
  const node = (
    <AccountModal
      key={state.key}
      open={state.open}
      onClose={() => setState((s) => ({ ...s, open: false }))}
      kind={state.kind}
      editing={state.editing}
      defaultSubtype={state.defaultSubtype}
    />
  );
  return { openNew, openEdit, node };
}
