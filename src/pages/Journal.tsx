import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Download, NotebookPen, CircleCheck, TriangleAlert, Lock } from 'lucide-react';
import { useBooks, useToday } from '../hooks/useApp';
import { useUI, toast } from '../store/ui';
import { entryTotals } from '../accounting/engine';
import { closingEntries } from '../accounting/reports';
import type { JournalEntry } from '../accounting/types';
import { formatDate, formatMoney, normalize, round2, isZero } from '../lib/format';
import { PageHeader } from '../components/layout/Topbar';
import { Badge, Button, EmptyState, TextInput, Dots, TableWrap } from '../components/ui/primitives';
import { Segmented } from '../components/ui/Segmented';
import { PeriodPicker, resolvePreset, type PeriodValue } from '../components/ui/PeriodPicker';

type Src = 'all' | 'tx' | 'manual' | 'adjusting' | 'asset';
const PAGE = 60;

export default function Journal() {
  const b = useBooks();
  const today = useToday();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const openTx = useUI((s) => s.openTx);
  const editTx = useUI((s) => s.editTx);
  const [tab, setTab] = useState<'general' | 'closing'>('general');
  const [q, setQ] = useState(params.get('cari') ?? '');
  const [src, setSrc] = useState<Src>('all');
  const [period, setPeriod] = useState<PeriodValue>(() => resolvePreset(params.get('cari') ? 'all' : 'this_month', b.fyStartMonth, today));
  const [closingPeriod, setClosingPeriod] = useState<PeriodValue>(() => resolvePreset('fiscal_year', b.fyStartMonth, today));
  const [limit, setLimit] = useState(PAGE);
  const [exporting, setExporting] = useState(false);

  const txById = useMemo(() => new Map(b.data.transactions.map((t) => [t.id, t])), [b]);

  const entries = useMemo(() => {
    const n = normalize(q.trim());
    return b.entries
      .filter((e) => {
        if (e.date < period.from || e.date > period.to) return false;
        if (src === 'tx' && (e.source !== 'tx' || e.txType === 'journal')) return false;
        if (src === 'manual' && e.txType !== 'journal') return false;
        if (src === 'adjusting' && !e.adjusting) return false;
        if (src === 'asset' && e.source === 'tx') return false;
        if (n) {
          const names = e.lines.map((l) => `${b.acc.get(l.accountId)?.name} ${b.acc.get(l.accountId)?.code} ${l.memo ?? ''}`).join(' ');
          if (!normalize(`${e.ref} ${e.description} ${names}`).includes(n)) return false;
        }
        return true;
      })
      .slice()
      .reverse();
  }, [b, q, src, period]);

  const totals = useMemo(() => {
    let d = 0;
    let c = 0;
    for (const e of entries) {
      const t = entryTotals(e);
      d += t.debit;
      c += t.credit;
    }
    return { d: round2(d), c: round2(c) };
  }, [entries]);

  const closing = useMemo(() => closingEntries(b, { ...closingPeriod, label: '' }), [b, closingPeriod]);

  const openEntry = (e: JournalEntry) => {
    if (e.txId) {
      const t = txById.get(e.txId);
      if (t) editTx(t);
    } else if (e.assetId) nav('/aset');
  };

  const doExport = async () => {
    setExporting(true);
    try {
      const { exportJournal } = await import('../export/excel');
      await exportJournal(b, entries.slice().reverse(), period);
      toast('Jurnal umum diekspor ke Excel', { tone: 'success' });
    } catch (err) {
      console.error(err);
      toast('Ekspor gagal', { tone: 'danger' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Jurnal Umum"
        subtitle="Seluruh jurnal berpasangan yang terbentuk dari transaksi, aset, dan jurnal manual"
        actions={
          <>
            {tab === 'general' && <PeriodPicker value={period} onChange={setPeriod} fyStartMonth={b.fyStartMonth} />}
            <Button icon={exporting ? undefined : Download} onClick={doExport} disabled={exporting || tab !== 'general'}>
              {exporting ? <Dots /> : 'Ekspor Excel'}
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => openTx({ type: 'journal' })}>
              Jurnal baru
            </Button>
          </>
        }
      />

      <div className="row" style={{ marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'general', label: 'Jurnal umum', icon: NotebookPen },
            { value: 'closing', label: 'Jurnal penutup', icon: Lock },
          ]}
        />
      </div>

      {tab === 'general' ? (
        <>
          <div className="card journal-card">
            <div className="list-toolbar">
              <div className="lt-row">
                <div className="fb-search">
                  <TextInput value={q} onChange={setQ} icon={Search} placeholder="Cari nomor bukti, keterangan, atau akun…" clearable sunken />
                </div>
                <Segmented
                  size="sm"
                  value={src}
                  onChange={setSrc}
                  options={[
                    { value: 'all', label: 'Semua' },
                    { value: 'tx', label: 'Transaksi' },
                    { value: 'manual', label: 'Manual' },
                    { value: 'adjusting', label: 'Penyesuaian' },
                    { value: 'asset', label: 'Aset' },
                  ]}
                />
              </div>
            </div>
            {entries.length === 0 ? (
              <EmptyState icon={NotebookPen} title="Tidak ada jurnal" text="Belum ada jurnal pada periode dan filter ini." />
            ) : (
              <TableWrap label="Jurnal umum">
                <table className="table journal-table">
                  <thead>
                    <tr>
                      <th style={{ width: 110 }}>Tanggal</th>
                      <th style={{ width: 150 }}>No. Bukti</th>
                      <th>Akun & Keterangan</th>
                      <th style={{ width: 90 }}>Kode</th>
                      <th className="r" style={{ width: 150 }}>Debit</th>
                      <th className="r" style={{ width: 150 }}>Kredit</th>
                    </tr>
                  </thead>
                  {entries.slice(0, limit).map((e) => {
                    const ordered = [...e.lines].sort((x, y) => (x.debit ? 0 : 1) - (y.debit ? 0 : 1));
                    return (
                      <tbody key={e.id} className="je-block" onClick={() => openEntry(e)}>
                        {ordered.map((l, i) => {
                          const a = b.acc.get(l.accountId);
                          return (
                            <tr key={i}>
                              <td>{i === 0 ? formatDate(e.date) : ''}</td>
                              <td>
                                {i === 0 && (
                                  <span className="row" style={{ gap: 6 }}>
                                    <span className="code">{e.ref}</span>
                                    {e.adjusting && <Badge tone="accent">AJP</Badge>}
                                  </span>
                                )}
                              </td>
                              <td style={{ paddingLeft: l.credit ? 40 : 14 }}>
                                {a?.name ?? '—'}
                                {l.memo && <span className="muted"> · {l.memo}</span>}
                              </td>
                              <td className="code">{a?.code}</td>
                              <td className="r num money-val">{l.debit ? formatMoney(l.debit, { symbol: false }) : ''}</td>
                              <td className="r num money-val">{l.credit ? formatMoney(l.credit, { symbol: false }) : ''}</td>
                            </tr>
                          );
                        })}
                        <tr className="je-desc">
                          <td />
                          <td />
                          <td colSpan={4}>({e.description})</td>
                        </tr>
                      </tbody>
                    );
                  })}
                  <tfoot>
                    <tr>
                      <td colSpan={4}>
                        <span className="row" style={{ gap: 8 }}>
                          Jumlah · {entries.length.toLocaleString('id-ID')} jurnal
                          {isZero(totals.d - totals.c) ? (
                            <Badge tone="pos" icon={CircleCheck}>Seimbang</Badge>
                          ) : (
                            <Badge tone="neg" icon={TriangleAlert}>Tidak seimbang</Badge>
                          )}
                        </span>
                      </td>
                      <td className="r num money-val">{formatMoney(totals.d, { symbol: false })}</td>
                      <td className="r num money-val">{formatMoney(totals.c, { symbol: false })}</td>
                    </tr>
                  </tfoot>
                </table>
              </TableWrap>
            )}
            {entries.length > limit && (
              <div className="load-more">
                <Button onClick={() => setLimit((l) => l + PAGE)}>Tampilkan {Math.min(PAGE, entries.length - limit)} jurnal lagi</Button>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="filter-bar card">
            <div className="grow muted" style={{ fontSize: 13 }}>
              Jurnal penutup menutup akun pendapatan, beban, dan prive ke saldo laba pada akhir periode.
            </div>
            <div className="fb-right">
              <PeriodPicker value={closingPeriod} onChange={setClosingPeriod} fyStartMonth={b.fyStartMonth} exclude={['all']} />
            </div>
          </div>
          <div className="card journal-card">
            {closing.length === 0 ? (
              <EmptyState icon={Lock} title="Tidak ada akun nominal" text="Tidak ada pendapatan atau beban pada periode ini." />
            ) : (
              <TableWrap label="Jurnal penutup">
                <table className="table journal-table">
                  <thead>
                    <tr>
                      <th style={{ width: 110 }}>Tanggal</th>
                      <th style={{ width: 60 }}>No.</th>
                      <th>Akun & Keterangan</th>
                      <th style={{ width: 90 }}>Kode</th>
                      <th className="r" style={{ width: 150 }}>Debit</th>
                      <th className="r" style={{ width: 150 }}>Kredit</th>
                    </tr>
                  </thead>
                  {closing.map((e) => (
                    <tbody key={e.no} className="je-block static">
                      {e.lines.map((l, i) => (
                        <tr key={i}>
                          <td>{i === 0 ? formatDate(closingPeriod.to) : ''}</td>
                          <td>{i === 0 ? <span className="code">JPT-{e.no}</span> : ''}</td>
                          <td style={{ paddingLeft: l.credit ? 40 : 14 }}>{l.name}</td>
                          <td className="code">{l.code}</td>
                          <td className="r num money-val">{l.debit ? formatMoney(l.debit, { symbol: false }) : ''}</td>
                          <td className="r num money-val">{l.credit ? formatMoney(l.credit, { symbol: false }) : ''}</td>
                        </tr>
                      ))}
                      <tr className="je-desc">
                        <td />
                        <td />
                        <td colSpan={4}>({e.title})</td>
                      </tr>
                    </tbody>
                  ))}
                </table>
              </TableWrap>
            )}
          </div>
        </>
      )}
    </div>
  );
}
