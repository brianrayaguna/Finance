import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { LayoutDashboard, Plus, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useBooks, useToday } from '../hooks/useApp';
import { useData } from '../store/data';
import { confirm, toast, usePrefs } from '../store/ui';
import { monthlySeries, periodFlow, positionAt } from '../accounting/reports';
import { addMonths, endOfMonth, formatDate, startOfMonth } from '../lib/format';
import { defaultLayout, moveWidget, packSpans, presetLayout, sizeOf, PRESETS, type DashLayout, type PresetId, type WidgetId } from '../app/dashboardLayout';
import { PageHeader } from '../components/layout/Topbar';
import { Button, EmptyState } from '../components/ui/primitives';
import { MonthSwitcher } from '../components/ui/MonthSwitcher';
import { DashCtx, type DashData } from '../components/dashboard/common';
import { WIDGETS, widgetSettings } from '../components/dashboard/registry';
import { EditBar, GallerySheet, WidgetFrame, useWidgetDrag } from '../components/dashboard/Customize';
import { Onboarding } from '../components/dashboard/Onboarding';
import { useGoalModal } from '../components/goals/GoalModal';

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.02 } },
};

const sameLayout = (a: DashLayout, b: DashLayout) => JSON.stringify(a) === JSON.stringify(b);

/** Lebar isi elemen, diperbarui saat ukurannya berubah (sidebar diciutkan, jendela diubah). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(1200);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export default function Dashboard() {
  const b = useBooks();
  const today = useToday();
  const profile = useData((s) => s.data.profile);
  const saved = usePrefs((s) => s.dashboard);
  const setLayout = usePrefs((s) => s.setLayout);
  const compact = usePrefs((s) => s.compactNumbers);
  const onboardingDismissed = usePrefs((s) => s.onboardingDismissed);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [draft, setDraft] = useState<DashLayout | null>(null);
  const [gallery, setGallery] = useState(false);
  const [announce, setAnnounce] = useState('');
  const goalModal = useGoalModal();
  const [dashRef, width] = useWidth<HTMLDivElement>();

  const editing = draft !== null;
  const layout = draft ?? saved;
  const spans = useMemo(() => packSpans(layout, width), [layout, width]);

  const from = month + '-01';
  const to = endOfMonth(from);
  const asOf = to > today ? today : to;
  const prevFrom = startOfMonth(addMonths(from, -1));
  const prevTo = endOfMonth(prevFrom);

  const isCurrent = month === today.slice(0, 7);
  // Bulan berjalan dibandingkan dengan tanggal yang sama bulan lalu (bukan bulan penuh) agar tren tidak tampak anjlok.
  const prevEnd = isCurrent ? addMonths(asOf, -1) : prevTo;
  const prevFlow = useMemo(() => periodFlow(b, prevFrom, prevEnd), [b, prevFrom, prevEnd]);
  const series = useMemo(() => monthlySeries(b, month, 12, today), [b, month, today]);
  const startMonth = useMemo(() => {
    let min = '';
    for (const t of b.data.transactions) if (!min || t.date < min) min = t.date;
    return min ? min.slice(0, 7) : undefined;
  }, [b]);
  const pos = useMemo(() => positionAt(b, asOf), [b, asOf]);
  const prevPos = useMemo(() => positionAt(b, prevTo), [b, prevTo]);
  const ctx: DashData = useMemo(
    () => ({ b, today, month, from, to, asOf, prevFrom, prevTo, isCurrent, prevEnd, prevFlow, series, startMonth, pos, prevPos, compact, width }),
    [b, today, month, from, to, asOf, prevFrom, prevTo, isCurrent, prevEnd, prevFlow, series, startMonth, pos, prevPos, compact, width],
  );

  /* ───────── mode sesuaikan ───────── */

  const update = useCallback((fn: (l: DashLayout) => DashLayout) => setDraft((d) => (d ? fn(d) : d)), []);
  const say = (id: WidgetId, order: WidgetId[]) => setAnnounce(`${WIDGETS[id].title} di posisi ${order.indexOf(id) + 1} dari ${order.length}`);

  // tata letak terbaru untuk seret-lepas (beberapa gerakan bisa terjadi sebelum render ulang)
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const { dragId, start } = useWidgetDrag((id, target, after) => {
    const l = layoutRef.current;
    const next = moveWidget(l.order, id, target, after);
    if (next === l.order) return false;
    layoutRef.current = { ...l, order: next };
    setDraft(layoutRef.current);
    say(id, next);
    return true;
  });

  // Elemen yang dipindah React di DOM kehilangan fokus — kembalikan ke pegangan widget (atau bilah sunting).
  const focusGrip = (id?: WidgetId) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = id ? document.querySelector<HTMLElement>(`[data-widget="${id}"] .w-grip`) : null;
        (el ?? document.querySelector<HTMLElement>('.dash-editbar button'))?.focus();
      }),
    );

  const stepTo = (id: WidgetId, index: number) => {
    const l = layoutRef.current;
    const rest = l.order.filter((x) => x !== id);
    const next = [...rest.slice(0, index), id, ...rest.slice(index)];
    if (next.every((x, k) => x === l.order[k])) return;
    layoutRef.current = { ...l, order: next };
    setDraft(layoutRef.current);
    say(id, next);
    focusGrip(id);
  };

  const hide = (id: WidgetId) => {
    const o = layoutRef.current.order;
    const i = o.indexOf(id);
    const neighbor = o[i + 1] ?? o[i - 1];
    update((l) => ({ ...l, order: l.order.filter((x) => x !== id) }));
    setAnnounce(`${WIDGETS[id].title} disembunyikan — tambahkan lagi dari galeri`);
    focusGrip(neighbor);
  };

  // Meninggalkan dasbor saat menyunting (klik menu, palet) menyimpan perubahan alih-alih membuangnya.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(
    () => () => {
      const d = draftRef.current;
      if (d && !sameLayout(d, usePrefs.getState().dashboard)) {
        usePrefs.getState().setLayout(() => d);
        toast('Perubahan tata letak dasbor disimpan', { tone: 'success' });
      }
    },
    [],
  );

  const startEdit = () => setDraft(structuredClone(saved));

  // ?sesuaikan=1 (dari palet perintah) langsung membuka mode sesuaikan
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get('sesuaikan') !== '1') return;
    setParams({}, { replace: true });
    setDraft((d) => d ?? structuredClone(usePrefs.getState().dashboard));
  }, [params, setParams]);
  const done = () => {
    if (draft && !sameLayout(draft, saved)) setLayout(() => draft);
    setDraft(null);
    setGallery(false);
  };
  const cancel = async () => {
    if (draft && !sameLayout(draft, saved)) {
      const ok = await confirm({ title: 'Batalkan perubahan tata letak?', message: 'Susunan, ukuran, dan pengaturan widget kembali seperti sebelum disesuaikan.', confirmLabel: 'Batalkan perubahan', tone: 'danger' });
      if (!ok) return;
    }
    setDraft(null);
    setGallery(false);
  };
  const applyPreset = (p: PresetId) => {
    setDraft(presetLayout(p));
    setAnnounce(`Tata letak ${PRESETS[p].name} diterapkan`);
  };
  const reset = () => {
    setDraft(defaultLayout());
    setAnnounce('Tata letak bawaan dipulihkan');
  };
  const onAdded = (id: WidgetId) => {
    setAnnounce(`${WIDGETS[id].title} ditambahkan di akhir dasbor`);
    window.setTimeout(() => document.querySelector(`[data-widget="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120);
  };

  const entity = profile.entityName?.trim() || 'Keuangan pribadi';
  const dirty = !!draft && !sameLayout(draft, saved);
  // Pengguna baru: buku masih kosong → tampilkan sambutan saja, bukan belasan widget "Belum ada…".
  const firstRun = !editing && !onboardingDismissed && b.data.transactions.length === 0;

  return (
    <div className={`dash${editing ? ' editing' : ''}`} ref={dashRef}>
      <PageHeader
        title="Ringkasan"
        subtitle={`Posisi per ${formatDate(asOf, 'long')} · ${entity}`}
        actions={
          <>
            <MonthSwitcher value={month} onChange={setMonth} />
            {!editing && (
              <Button icon={SlidersHorizontal} onClick={startEdit}>
                Sesuaikan
              </Button>
            )}
          </>
        }
      />

      <AnimatePresence>{editing && <EditBar dirty={dirty} onGallery={() => setGallery(true)} onCancel={cancel} onDone={done} />}</AnimatePresence>

      {!editing && <Onboarding onGoal={goalModal.openNew} first={firstRun} />}

      <DashCtx.Provider value={ctx}>
        {firstRun ? null : layout.order.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={LayoutDashboard}
              title="Dasbor kosong"
              text="Semua widget disembunyikan. Tambahkan widget yang Anda perlukan atau kembalikan tata letak bawaan."
              action={
                <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
                  <Button
                    variant="primary"
                    icon={Plus}
                    onClick={() => {
                      if (!editing) startEdit();
                      setGallery(true);
                    }}
                  >
                    Tambah widget
                  </Button>
                  <Button icon={RotateCcw} onClick={() => (editing ? reset() : setLayout(() => defaultLayout()))}>
                    Tata letak bawaan
                  </Button>
                </div>
              }
            />
          </div>
        ) : (
          <LayoutGroup>
            <motion.div className="dash-grid" variants={stagger} initial="hidden" animate="show" key={month}>
              {layout.order.map((id, i) => {
                const W = WIDGETS[id].Component;
                return (
                  <WidgetFrame
                    key={id}
                    id={id}
                    layout={layout}
                    editing={editing}
                    dragging={dragId === id}
                    span={spans[i]}
                    index={i}
                    count={layout.order.length}
                    onGrip={(e) => start(id, e)}
                    update={update}
                    onStep={stepTo}
                    onHide={hide}
                  >
                    <W settings={widgetSettings(id, layout.settings[id])} size={sizeOf(layout, id)} layout={layout} />
                  </WidgetFrame>
                );
              })}
            </motion.div>
          </LayoutGroup>
        )}
      </DashCtx.Provider>

      <div className="sr-only" aria-live="polite">
        {announce}
      </div>

      {editing && (
        <GallerySheet open={gallery} onClose={() => setGallery(false)} layout={layout} update={update} onAdded={onAdded} onPreset={applyPreset} onReset={reset} />
      )}
      {goalModal.node}
    </div>
  );
}
