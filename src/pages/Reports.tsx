import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FileSpreadsheet,
  Printer,
  Download,
  CircleCheck,
  Package,
  TriangleAlert,
} from '../lib/glyphs';
import { useBooks, useToday } from '../hooks/useApp';
import { toast, usePrefs } from '../store/ui';
import {
  agingReport,
  balanceSheet,
  budgetReport,
  cashFlowStatement,
  equityStatement,
  incomeStatement,
  ratios,
  worksheet,
  type Ratio,
} from '../accounting/reports';
import { makeDates, makePeriods } from '../accounting/periods';
import type { Report } from '../accounting/types';
import { formatDate, formatRatio, periodLabel } from '../lib/format';
import { PageHeader } from '../components/layout/Topbar';
import { Badge, Button, Dots, Switch, Checkbox } from '../components/ui/primitives';
import { PeriodPicker, resolvePreset, type PeriodValue, describePeriod } from '../components/ui/PeriodPicker';
import { Segmented } from '../components/ui/Segmented';
import { Modal } from '../components/ui/Modal';
import { ReportView } from '../components/report/ReportView';
import { REPORTS, type ReportKey } from '../app/reports';

export { REPORTS, type ReportKey };

export function buildReport(b: ReturnType<typeof useBooks>, key: ReportKey, from: string, to: string, compare: boolean): Report | null {
  const entity = b.data.profile.entityName || 'Buku Keuangan';
  const P = { from, to, label: periodLabel(from, to) };
  switch (key) {
    case 'laba-rugi':
      return incomeStatement(b, makePeriods(from, to, compare), entity);
    case 'neraca':
      return balanceSheet(b, makeDates(to, compare, from), entity);
    case 'arus-kas':
      return cashFlowStatement(b, makePeriods(from, to, compare), entity);
    case 'ekuitas':
      return equityStatement(b, P, entity);
    case 'lajur':
      return worksheet(b, P, entity);
    case 'umur-piutang':
      return agingReport(b.data, 'receivable', to, entity);
    case 'umur-hutang':
      return agingReport(b.data, 'payable', to, entity);
    case 'anggaran':
      return budgetReport(b, P, entity);
    default:
      return null;
  }
}

export default function Reports() {
  const b = useBooks();
  const today = useToday();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const key = (REPORTS.find((r) => r.key === params.get('r'))?.key ?? 'laba-rugi') as ReportKey;
  const reportPreset = usePrefs((s) => s.reportPreset);
  const [period, setPeriod] = useState<PeriodValue>(() => resolvePreset(reportPreset, b.fyStartMonth, today));
  const [compare, setCompare] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pack, setPack] = useState(params.get('ekspor') === '1');

  useEffect(() => {
    if (params.get('ekspor')) {
      const p = new URLSearchParams(params);
      p.delete('ekspor');
      setParams(p, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const meta = REPORTS.find((r) => r.key === key)!;
  const from = period.preset === 'all' ? (b.entries[0]?.date ?? today) : period.from;
  const to = period.preset === 'all' ? today : period.to;
  const asOf = to;
  const report = useMemo(() => buildReport(b, key, from, asOf, compare && meta.compare), [b, key, from, asOf, compare, meta.compare]);
  const ratioList = useMemo(() => (key === 'rasio' ? ratios(b, { from, to: asOf, label: '' }) : []), [b, key, from, asOf]);

  const select = (k: ReportKey) => setParams({ r: k }, { replace: true });

  const exportOne = async () => {
    setExporting(true);
    try {
      const { exportReports, exportRatios } = await import('../export/excel');
      if (key === 'rasio') await exportRatios(b, ratioList, { from, to: asOf });
      else if (report) await exportReports(b, [report], `${meta.label} ${describePeriod(period)}`);
      toast(`${meta.label} diekspor ke Excel`, { tone: 'success' });
    } catch (e) {
      console.error(e);
      toast('Ekspor gagal', { tone: 'danger' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Laporan Keuangan"
        subtitle={`${b.data.profile.entityName || 'Buku keuangan'} · ${periodLabel(from, asOf)}`}
        actions={
          <>
            <Button icon={Printer} onClick={() => window.print()}>
              Cetak
            </Button>
            <Button icon={exporting ? undefined : Download} onClick={exportOne} disabled={exporting}>
              {exporting ? <Dots /> : 'Ekspor laporan ini'}
            </Button>
            <Button variant="primary" icon={FileSpreadsheet} onClick={() => setPack(true)}>
              Paket laporan Excel
            </Button>
          </>
        }
      />

      <div className="reports-layout">
        <nav className="card report-nav no-print">
          {REPORTS.map((r) => (
            <button key={r.key} type="button" className={`rn-item${r.key === key ? ' active' : ''}`} onClick={() => select(r.key)}>
              {r.key === key && <motion.span layoutId="rn-pill" className="rn-pill" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
              <r.icon />
              <span className="col" style={{ minWidth: 0 }}>
                <span className="rn-label">{r.label}</span>
                <span className="rn-desc truncate">{r.desc}</span>
              </span>
            </button>
          ))}
        </nav>

        <section className="report-main">
          <div className="report-controls card no-print">
            <PeriodPicker value={period} onChange={setPeriod} fyStartMonth={b.fyStartMonth} />
            {meta.compare && (
              <label className="row compare-toggle">
                <Switch checked={compare} onChange={setCompare} label="Bandingkan periode" />
                <span>Bandingkan dengan periode sebelumnya</span>
              </label>
            )}
            <span className="spacer" />
            {report?.checks?.length ? (
              report.checks.every((c) => c.ok) ? (
                <Badge tone="pos" icon={CircleCheck}>
                  Semua uji keseimbangan lolos
                </Badge>
              ) : (
                <Badge tone="neg" icon={TriangleAlert}>
                  {report.checks.filter((c) => !c.ok).length} uji keseimbangan gagal — periksa Pengaturan › Integritas buku
                </Badge>
              )
            ) : null}
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={key + from + asOf + compare} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
              {key === 'rasio' ? (
                <RatiosView list={ratioList} from={from} to={asOf} entity={b.data.profile.entityName} />
              ) : report ? (
                <ReportView report={report} entity={b.data.profile.entityName || 'Buku Keuangan'} onAccount={(id) => nav(`/buku-besar?akun=${id}`)} />
              ) : null}
            </motion.div>
          </AnimatePresence>
        </section>
      </div>
      {pack && <PackModal onClose={() => setPack(false)} initialPeriod={period} />}
    </div>
  );
}

const fmtRatio = (r: Ratio) => formatRatio(r.value, r.unit);

function RatiosView({ list, from, to, entity }: { list: Ratio[]; from: string; to: string; entity: string }) {
  const groups = [...new Set(list.map((r) => r.group))];
  const statusLabel = { good: 'Sehat', warn: 'Perlu perhatian', bad: 'Lemah', na: 'Tidak tersedia' };
  return (
    <div className="paper ratios-paper">
      <div className="paper-head">
        <div className="ph-entity">{entity}</div>
        <div className="ph-title">Analisis Rasio Keuangan</div>
        <div className="ph-period">
          Periode {formatDate(from, 'long')} – {formatDate(to, 'long')}
        </div>
      </div>
      {groups.map((g) => (
        <div key={g} className="ratio-group">
          <h4>{g}</h4>
          <div className="ratio-grid">
            {list
              .filter((r) => r.group === g)
              .map((r) => (
                <div key={r.name} className={`ratio-card st-${r.status}`}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="rc-name">{r.name}</span>
                    <Badge tone={r.status === 'good' ? 'pos' : r.status === 'warn' ? 'warn' : r.status === 'bad' ? 'neg' : 'default'} dot>
                      {statusLabel[r.status]}
                    </Badge>
                  </div>
                  <div className="rc-value num">{fmtRatio(r)}</div>
                  <div className="rc-formula">{r.formula}</div>
                  <div className="rc-bench">Acuan {r.benchmark}</div>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const PACK_ITEMS: { key: string; label: string; group: string }[] = [
  { key: 'laba-rugi', label: 'Laporan Laba Rugi', group: 'Laporan utama' },
  { key: 'neraca', label: 'Laporan Posisi Keuangan', group: 'Laporan utama' },
  { key: 'arus-kas', label: 'Laporan Arus Kas', group: 'Laporan utama' },
  { key: 'ekuitas', label: 'Laporan Perubahan Ekuitas', group: 'Laporan utama' },
  { key: 'rasio', label: 'Analisis Rasio Keuangan', group: 'Analisis' },
  { key: 'anggaran', label: 'Anggaran vs Realisasi', group: 'Analisis' },
  { key: 'umur-piutang', label: 'Umur Piutang', group: 'Analisis' },
  { key: 'umur-hutang', label: 'Umur Hutang', group: 'Analisis' },
  { key: 'neraca-saldo', label: 'Neraca Saldo', group: 'Pembukuan' },
  { key: 'lajur', label: 'Neraca Lajur', group: 'Pembukuan' },
  { key: 'jurnal', label: 'Jurnal Umum', group: 'Pembukuan' },
  { key: 'penutup', label: 'Jurnal Penutup', group: 'Pembukuan' },
  { key: 'buku-besar', label: 'Buku Besar', group: 'Pembukuan' },
  { key: 'transaksi', label: 'Daftar Transaksi', group: 'Data' },
  { key: 'aset', label: 'Register Aset Tetap', group: 'Data' },
  { key: 'bagan-akun', label: 'Bagan Akun', group: 'Data' },
];

function PackModal({ onClose, initialPeriod }: { onClose: () => void; initialPeriod: PeriodValue }) {
  const b = useBooks();
  const today = useToday();
  const [period, setPeriod] = useState(initialPeriod);
  const [compare, setCompare] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set(PACK_ITEMS.map((i) => i.key)));
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'all' | 'main'>('all');

  const setPreset = (m: 'all' | 'main') => {
    setMode(m);
    setSel(new Set(m === 'all' ? PACK_ITEMS.map((i) => i.key) : PACK_ITEMS.filter((i) => i.group === 'Laporan utama').map((i) => i.key)));
  };

  const run = async () => {
    setBusy(true);
    try {
      const { exportPackage } = await import('../export/excel');
      const from = period.preset === 'all' ? (b.entries[0]?.date ?? today) : period.from;
      const to = period.preset === 'all' ? today : period.to;
      await exportPackage(b, { from, to, compare, include: sel });
      toast('Paket laporan keuangan berhasil dibuat', { tone: 'success', detail: `${sel.size} lembar kerja · ${describePeriod(period)}` });
      onClose();
    } catch (e) {
      console.error(e);
      toast('Ekspor gagal', { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const groups = [...new Set(PACK_ITEMS.map((i) => i.group))];
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Paket Laporan Keuangan"
      subtitle="Satu buku kerja Excel siap presentasi: sampul, daftar isi, dan setiap laporan dengan rumus aktif"
      icon={<span className="xls-badge"><FileSpreadsheet /></span>}
      footer={
        <>
          <span className="hint">
            <Package size={14} /> {sel.size} lembar dipilih
          </span>
          <span className="spacer" />
          <Button onClick={onClose}>Batal</Button>
          <Button variant="primary" icon={busy ? undefined : Download} onClick={run} disabled={busy || sel.size === 0}>
            {busy ? <Dots /> : 'Unduh .xlsx'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <PeriodPicker value={period} onChange={setPeriod} fyStartMonth={b.fyStartMonth} />
          <label className="row compare-toggle">
            <Switch checked={compare} onChange={setCompare} label="Komparatif" />
            <span>Kolom komparatif periode sebelumnya</span>
          </label>
          <span className="spacer" />
          <Segmented
            size="sm"
            value={mode}
            onChange={setPreset}
            options={[
              { value: 'all', label: 'Lengkap' },
              { value: 'main', label: 'Laporan utama' },
            ]}
          />
        </div>
        <div className="pack-grid">
          {groups.map((g) => (
            <div key={g} className="pack-group">
              <div className="label-caps">{g}</div>
              {PACK_ITEMS.filter((i) => i.group === g).map((i) => (
                <label key={i.key} className="pack-item">
                  <Checkbox
                    checked={sel.has(i.key)}
                    onChange={(v) =>
                      setSel((s) => {
                        const n = new Set(s);
                        if (v) n.add(i.key);
                        else n.delete(i.key);
                        return n;
                      })
                    }
                    label={i.label}
                  />
                  <span>{i.label}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
