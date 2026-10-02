/*
 * Mode "Sesuaikan" dasbor: bingkai widget dengan pegangan seret, ukuran, pengaturan, dan sembunyikan;
 * bilah mode sunting; serta galeri widget & tata letak siap pakai.
 */
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Check, ChevronDown, EyeOff, GripVertical, LayoutDashboard, Plus, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import {
  ALL_KPI,
  KPI_LABEL,
  PRESETS,
  SIZE_LABEL,
  WIDGET_SIZES,
  sizeOf,
  type DashLayout,
  type KpiMetric,
  type PresetId,
  type SettingValue,
  type WidgetId,
} from '../../app/dashboardLayout';
import { Sheet } from '../ui/Modal';
import { Menu, Popover } from '../ui/Popover';
import { Segmented } from '../ui/Segmented';
import { Select } from '../ui/Select';
import { Button, IconTile, Switch } from '../ui/primitives';
import { Tooltip } from '../ui/Tooltip';
import { WIDGETS, widgetSettings } from './registry';

export type LayoutUpdate = (fn: (l: DashLayout) => DashLayout) => void;

/* ───────── Seret untuk memindahkan (pointer: mouse, sentuh, pena) ───────── */

/**
 * Seret-lepas berbasis pointer. Pendengar dipasang di window (bukan pointer capture) karena
 * elemen yang diseret ikut berpindah posisi di DOM saat urutan berubah.
 * `onMove` mengembalikan true bila urutan benar-benar berubah.
 */
export function useWidgetDrag(onMove: (id: WidgetId, target: WidgetId, after: boolean) => boolean) {
  const [dragId, setDragId] = useState<WidgetId | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const moveRef = useRef(onMove);
  moveRef.current = onMove;

  useEffect(() => () => stopRef.current?.(), []);

  const start = (id: WidgetId, e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    stopRef.current?.();
    let x = e.clientX;
    let y = e.clientY;
    let lock = 0;
    let raf = 0;
    const hitTest = () => {
      if (performance.now() < lock) return;
      const hit = document
        .elementsFromPoint(x, y)
        .find((el): el is HTMLElement => el instanceof HTMLElement && !!el.dataset.widget && el.dataset.widget !== id);
      if (!hit) return;
      // Sisi target menentukan sebelum/sesudah (tidak berayun saat ukuran berbeda): kiri/kanan untuk
      // widget sebaris, atas/bawah untuk widget selebar baris (layar sempit, ukuran Penuh).
      const r = hit.getBoundingClientRect();
      const grid = hit.parentElement?.getBoundingClientRect();
      const fullRow = !!grid && r.width >= grid.width - 4;
      const after = fullRow ? y > r.top + r.height / 2 : x > r.left + r.width / 2;
      if (moveRef.current(id, hit.dataset.widget as WidgetId, after)) lock = performance.now() + 180;
    };
    const move = (ev: PointerEvent) => {
      x = ev.clientX;
      y = ev.clientY;
      hitTest();
    };
    // gulir otomatis saat penunjuk berada di tepi atas/bawah layar
    const tick = () => {
      const edge = 84;
      const vh = window.innerHeight;
      const dy = y < edge ? -Math.ceil((edge - y) / 5) : y > vh - edge ? Math.ceil((y - (vh - edge)) / 5) : 0;
      if (dy) {
        // 'instant': html memakai scroll-behavior smooth yang akan memperlambat gulir per bingkai
        window.scrollBy({ top: dy, behavior: 'instant' });
        hitTest();
      }
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      cancelAnimationFrame(raf);
      document.body.classList.remove('dragging-widget');
      stopRef.current = null;
      setDragId(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    raf = requestAnimationFrame(tick);
    document.body.classList.add('dragging-widget');
    stopRef.current = stop;
    setDragId(id);
  };

  return { dragId, start };
}

/* ───────── Bingkai widget ───────── */

export const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 30 } },
};

export function WidgetFrame({
  id,
  layout,
  editing,
  dragging,
  span,
  index,
  count,
  onGrip,
  update,
  onStep,
  onHide,
  children,
}: {
  id: WidgetId;
  layout: DashLayout;
  editing: boolean;
  dragging: boolean;
  /** Lebar tampil (kolom dari 12) hasil penataan baris */
  span: number;
  index: number;
  count: number;
  onGrip: (e: React.PointerEvent<HTMLElement>) => void;
  update: LayoutUpdate;
  onStep: (id: WidgetId, to: number) => void;
  onHide: (id: WidgetId) => void;
  children: ReactNode;
}) {
  const meta = WIDGETS[id];
  const size = sizeOf(layout, id);
  const hintId = useId();
  return (
    <motion.div
      layout="position"
      variants={itemVariants}
      transition={{ layout: { type: 'spring', stiffness: 520, damping: 44 } }}
      data-widget={id}
      className={`w w-${id} w-${size}${editing ? ' is-editing' : ''}${dragging ? ' is-dragging' : ''}`}
      style={{ '--span': span } as CSSProperties}
    >
      {editing && (
        <div className="w-edit" role="toolbar" aria-label={`Atur ${meta.title}`}>
          <button
            type="button"
            className="w-grip"
            onPointerDown={onGrip}
            onKeyDown={(e) => {
              const map: Record<string, number> = { ArrowUp: index - 1, ArrowLeft: index - 1, ArrowDown: index + 1, ArrowRight: index + 1, Home: 0, End: count - 1 };
              if (map[e.key] === undefined) return;
              e.preventDefault();
              onStep(id, Math.max(0, Math.min(count - 1, map[e.key])));
            }}
            aria-label={`Pindahkan ${meta.title}, posisi ${index + 1} dari ${count}`}
            aria-describedby={hintId}
          >
            <GripVertical aria-hidden />
          </button>
          <span className="sr-only" id={hintId}>
            Seret, atau gunakan tombol panah untuk memindahkan.
          </span>
          <span className="w-name truncate">{meta.title}</span>
          <Menu
            placement="bottom-end"
            minWidth={170}
            items={[
              { heading: 'Ukuran' },
              ...WIDGET_SIZES[id].sizes.map((s) => ({
                label: SIZE_LABEL[s],
                checked: s === size,
                onSelect: () => update((l) => ({ ...l, sizes: { ...l.sizes, [id]: s } })),
              })),
            ]}
            trigger={(p) => (
              <button type="button" className="w-tool w-size" ref={p.ref} onClick={p.onClick} aria-expanded={p['aria-expanded']} aria-label={`Ukuran ${meta.title}: ${SIZE_LABEL[size]}`}>
                {SIZE_LABEL[size]}
                <ChevronDown aria-hidden />
              </button>
            )}
          />
          {(meta.settings?.length || id === 'kpi') && <SettingsButton id={id} layout={layout} update={update} />}
          <Tooltip label="Sembunyikan">
            <button type="button" className="w-tool" onClick={() => onHide(id)} aria-label={`Sembunyikan ${meta.title}`}>
              <EyeOff aria-hidden />
            </button>
          </Tooltip>
        </div>
      )}
      <div className="w-body" inert={editing}>
        {children}
      </div>
    </motion.div>
  );
}

/* ───────── Pengaturan per widget ───────── */

function SettingsButton({ id, layout, update }: { id: WidgetId; layout: DashLayout; update: LayoutUpdate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const meta = WIDGETS[id];
  return (
    <>
      <Tooltip label="Pengaturan">
        <button type="button" ref={ref} className={`w-tool${open ? ' on' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={`Pengaturan ${meta.title}`}>
          <SlidersHorizontal aria-hidden />
        </button>
      </Tooltip>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} placement="bottom-end" width={290} autoFocus>
        <WidgetSettings id={id} layout={layout} update={update} />
      </Popover>
    </>
  );
}

export function WidgetSettings({ id, layout, update }: { id: WidgetId; layout: DashLayout; update: LayoutUpdate }) {
  const meta = WIDGETS[id];
  const values = widgetSettings(id, layout.settings[id]);
  const set = (key: string, v: SettingValue) => update((l) => ({ ...l, settings: { ...l.settings, [id]: { ...(l.settings[id] ?? {}), [key]: v } } }));
  const setKpi = (i: number, k: KpiMetric) =>
    update((l) => {
      const kpi = [...l.kpi];
      const j = kpi.indexOf(k);
      if (j >= 0) kpi[j] = kpi[i]; // metrik yang sudah dipakai: tukar posisi
      kpi[i] = k;
      return { ...l, kpi };
    });
  return (
    <div className="wset">
      <div className="wset-title">{meta.title}</div>
      {id === 'kpi' &&
        layout.kpi.map((k, i) => (
          <div className="wset-row" key={i}>
            <span className="wset-label">Kartu {i + 1}</span>
            <div style={{ width: 170 }}>
              <Select
                compact
                value={k}
                onChange={(v) => setKpi(i, v)}
                options={ALL_KPI.map((m) => ({ value: m, label: KPI_LABEL[m] }))}
                ariaLabel={`Isi kartu ${i + 1}`}
                width={220}
              />
            </div>
          </div>
        ))}
      {meta.settings?.map((s) =>
        s.type === 'toggle' ? (
          <label className="wset-row" key={s.key}>
            <span className="wset-label">{s.label}</span>
            <Switch checked={values[s.key] === true} onChange={(v) => set(s.key, v)} label={s.label} />
          </label>
        ) : (
          <div className="wset-row col" key={s.key}>
            <span className="wset-label">{s.label}</span>
            <Segmented size="sm" value={String(values[s.key])} onChange={(v) => set(s.key, v)} options={s.options} />
          </div>
        ),
      )}
    </div>
  );
}

/* ───────── Bilah mode sunting ───────── */

export function EditBar({ onGallery, onCancel, onDone, dirty }: { onGallery: () => void; onCancel: () => void; onDone: () => void; dirty: boolean }) {
  return (
    <motion.div
      className="dash-editbar"
      role="region"
      aria-label="Menyesuaikan dasbor"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18 }}
    >
      <span className="deb-ico" aria-hidden>
        <LayoutDashboard />
      </span>
      <div className="deb-text">
        <strong>Menyesuaikan dasbor</strong>
        <span>Seret ⠿ untuk memindahkan, ubah ukuran, atur, atau sembunyikan widget.</span>
      </div>
      <span className="spacer" />
      <Button icon={Plus} onClick={onGallery}>
        Tambah widget
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        {dirty ? 'Batalkan' : 'Tutup'}
      </Button>
      <Button variant="primary" icon={Check} onClick={onDone}>
        Selesai
      </Button>
    </motion.div>
  );
}

/* ───────── Galeri widget & tata letak siap pakai ───────── */

const GROUPS = ['Ringkasan', 'Aktivitas', 'Perencanaan', 'Pembukuan'] as const;

export function GallerySheet({
  open,
  onClose,
  layout,
  update,
  onAdded,
  onPreset,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  layout: DashLayout;
  update: LayoutUpdate;
  onAdded: (id: WidgetId) => void;
  onPreset: (id: PresetId) => void;
  onReset: () => void;
}) {
  const shown = new Set(layout.order);
  return (
    <Sheet open={open} onClose={onClose} width={460} ariaLabel="Galeri widget">
      <div className="gal">
        <div className="dsh-head">
          <IconTile icon={LayoutDashboard} color="var(--accent)" solid />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="modal-title">Widget & tata letak</div>
            <div className="muted" style={{ fontSize: 13 }}>
              {layout.order.length} dari {Object.keys(WIDGETS).length} widget ditampilkan
            </div>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Tutup">
            <X />
          </button>
        </div>
        <div className="dsh-body">
          <div className="label-caps" style={{ margin: '0 0 8px' }}>
            Tata letak siap pakai
          </div>
          <div className="gal-presets">
            {(Object.keys(PRESETS) as PresetId[]).map((p) => (
              <button type="button" key={p} className="gal-preset" onClick={() => onPreset(p)}>
                <PresetThumb id={p} />
                <strong>{PRESETS[p].name}</strong>
                <span>{PRESETS[p].desc}</span>
              </button>
            ))}
          </div>
          {GROUPS.map((g) => (
            <div key={g} className="gal-group">
              <div className="label-caps">{g}</div>
              {(Object.keys(WIDGETS) as WidgetId[])
                .filter((id) => WIDGETS[id].group === g)
                .map((id) => {
                  const m = WIDGETS[id];
                  const on = shown.has(id);
                  return (
                    <div key={id} className={`gal-item${on ? ' on' : ''}`}>
                      <IconTile icon={m.icon} color={on ? 'var(--accent)' : 'var(--text-3)'} size="sm" />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="gal-name">{m.title}</div>
                        <div className="gal-desc">{m.desc}</div>
                      </div>
                      {on ? (
                        <Button size="sm" variant="ghost" icon={EyeOff} onClick={() => update((l) => ({ ...l, order: l.order.filter((x) => x !== id) }))} aria-label={`Sembunyikan ${m.title}`}>
                          Sembunyikan
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          icon={Plus}
                          onClick={() => {
                            update((l) => ({ ...l, order: [...l.order, id] }));
                            onAdded(id);
                          }}
                          aria-label={`Tambah ${m.title}`}
                        >
                          Tambah
                        </Button>
                      )}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
        <div className="gal-foot">
          <Button variant="ghost" icon={RotateCcw} onClick={onReset}>
            Kembalikan bawaan
          </Button>
          <span className="spacer" />
          <Button variant="primary" onClick={onClose}>
            Selesai
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

/** Miniatur tata letak: kotak-kotak berukuran sesuai widget. */
function PresetThumb({ id }: { id: PresetId }) {
  const p = PRESETS[id];
  return (
    <span className="gal-thumb" aria-hidden>
      {p.order.slice(0, 9).map((w) => {
        const s = p.sizes?.[w] ?? WIDGET_SIZES[w].def;
        return <i key={w} className={`t-${s}${w === 'hero' ? ' hero' : ''}`} />;
      })}
    </span>
  );
}
