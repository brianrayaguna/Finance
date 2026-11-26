import { useState } from 'react';
import type { StockCategory } from '../../accounting/types';
import { addStockCategory, updateStockCategory } from '../../store/data';
import { notify } from '../../store/history';
import { isImeComposing } from '../../lib/layers';
import { useSubmitRef } from '../../lib/focus';
import { Modal } from '../ui/Modal';
import { Button, Field, IconTile, TextInput } from '../ui/primitives';
import { ColorPicker, IconPicker } from '../ui/Pickers';

export function StockCategoryModal({
  editing,
  onClose,
  onSaved,
}: {
  editing?: StockCategory;
  onClose: () => void;
  onSaved?: (cat: StockCategory) => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [icon, setIcon] = useState(editing?.icon ?? 'package');
  const [color, setColor] = useState(editing?.color ?? '#8A6546');
  const [tried, setTried] = useState(false);
  const err = !name.trim() ? 'Nama wajib' : null;

  const submit = () => {
    setTried(true);
    if (err) return;
    if (editing) {
      const hid = updateStockCategory(editing.id, { name: name.trim(), icon, color });
      if (hid) notify('Kategori disimpan', hid);
      onSaved?.({ ...editing, name: name.trim(), icon, color });
    } else {
      const { category, historyId } = addStockCategory({ name: name.trim(), icon, color });
      if (historyId) notify('Kategori ditambah', historyId);
      onSaved?.(category);
    }
    onClose();
  };
  const submitRef = useSubmitRef(submit);

  return (
    <Modal
      open
      title={editing ? 'Ubah kategori' : 'Kategori baru'}
      onClose={onClose}
      size="md"
      icon={<IconTile icon={icon} color={color} size="lg" solid />}
      footer={
        <>
          <span className="spacer" />
          <Button onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={() => submitRef.run()}>
            {editing ? 'Simpan' : 'Tambah'}
          </Button>
        </>
      }
    >
      <div
        className="tx-grid"
        style={{ marginTop: 4 }}
        data-form
        onKeyDown={(e) => {
          if (!isImeComposing(e) && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submitRef.runFrom(e.target);
          }
        }}
      >
        <Field label="Nama" error={tried && err} className="span-2">
          <TextInput value={name} onChange={setName} autoFocus placeholder="mis. Minuman" data-field invalid={tried && !!err} />
        </Field>
        <Field label="Warna" className="span-2">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <Field label="Ikon" className="span-2">
          <IconPicker value={icon} color={color} onChange={setIcon} />
        </Field>
      </div>
    </Modal>
  );
}
