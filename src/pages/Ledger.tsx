import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Search, BookOpenText } from 'lucide-react';
import { useBooks, useToday } from '../hooks/useApp';
import { useUI, toast } from '../store/ui';
import { SUBTYPE_META, TYPE_LABEL, TYPE_ORDER, normalSide } from '../accounting/coa';
import { displayBalances, ledger } from '../accounting/reports';
import { formatDate, formatMoney, normalize } from '../lib/format';
import { PageHeader } from '../components/layout/Topbar';
import { Badge, Button, EmptyState, IconTile, Money, TextInput, Dots, TableWrap } from '../components/ui/primitives';
import { PeriodPicker, resolvePreset, type PeriodValue } from '../components/ui/PeriodPicker';

export default function Ledger() {
  const b = useBooks();
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const editTx = useUI((s) => s.editTx);
  const [sel, setSel] = useState(params.get('akun') ?? b.accounts.find((a) => a.subtype === 'bank')?.id ?? b.accounts[0]?.id ?? '');
  const [q, setQ] = useState('');
  const [period, setPeriod] = useState<PeriodValue>(() => resolvePreset('this_month', b.fyStartMonth, today));
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const a = params.get('akun');
    if (a && a !== sel) setSel(a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // akun laba rugi ditampilkan per tahun buku berjalan, akun neraca kumulatif
  const balOf = useMemo(() => displayBalances(b, today), [b, today]);
  const groups = useMemo(() => {
    const n = normalize(q);
    return TYPE_ORDER.map((t) => ({
      type: t,
      items: b.accounts.filter((a) => a.type === t && a.subtype !== 'income_summary' && (!n || normalize(`${a.name} ${a.code}`).includes(n))),
    })).filter((g) => g.items.length);
  }, [b, q]);

  const view = useMemo(() => (sel ? ledger(b, sel, period.from, period.to) : null), [b, sel, period]);
  const txById = useMemo(() => new Map(b.data.transactions.map((t) => [t.id, t])), [b]);
  const a = view?.account;
  const side = a ? normalSide(a) : 'debit';

  const choose = (id: string) => {
    setSel(id);
    setParams({ akun: id }, { replace: true });
  };

  const doExport = async () => {
    setExporting(true);
    try {
      const { exportLedger } = await import('../export/excel');
      await exportLedger(b, period, sel ? [sel] : undefined);
      toast('Buku besar diekspor ke Excel', { tone: 'success' });
    } catch (e) {
      console.error(e);
      toast('Ekspor gagal', { tone: 'danger' });
    } finally {
      setExporting(false);
    }
  };
  const exportAll = async () => {
    setExporting(true);
    try {
      const { exportLedger } = await import('../export/excel');
      await exportLedger(b, period);
      toast('Buku besar seluruh akun diekspor', { tone: 'success' });
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
        title="Buku Besar"
        subtitle="Mutasi dan saldo berjalan setiap akun"
        actions={
          <>
            <PeriodPicker value={period} onChange={setPeriod} fyStartMonth={b.fyStartMonth} />
            <Button icon={Download} onClick={exportAll} disabled={exporting}>
              Semua akun
            </Button>
            <Button variant="primary" icon={exporting ? undefined : Download} onClick={doExport} disabled={exporting || !sel}>
              {exporting ? <Dots /> : 'Ekspor akun ini'}
            </Button>
          </>
        }
      />
      <div className="ledger-layout">
        <aside className="card ledger-accounts">
          <div style={{ padding: 10 }}>
            <TextInput value={q} onChange={setQ} icon={Search} placeholder="Cari akun…" clearable sunken />
          </div>
          <div className="la-list">
            {groups.map((g) => (
              <div key={g.type}>
                <div className="list-group">{TYPE_LABEL[g.type]}</div>
                {g.items.map((acc) => {
                  const v = balOf(acc);
                  return (
                    <button key={acc.id} type="button" className={`la-item${acc.id === sel ? ' active' : ''}${acc.archived ? ' archived' : ''}`} onClick={() => choose(acc.id)}>
                      <IconTile icon={acc.icon} color={acc.color} size="xs" />
                      <span className="col grow" style={{ minWidth: 0 }}>
                        <span className="truncate">{acc.name}</span>
                        <span className="la-code">{acc.code}</span>
                      </span>
                      <span className="num money-val la-bal">{v ? formatMoney(v, { compact: true, symbol: false }) : '–'}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </aside>

        <section className="card ledger-main">
          {!view || !a ? (
            <EmptyState icon={BookOpenText} title="Pilih akun" text="Pilih akun di sebelah kiri untuk melihat mutasinya." />
          ) : (
            <>
              <div className="lm-head">
                <IconTile icon={a.icon} color={a.color} size="lg" solid />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="lm-title">{a.name}</div>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <span className="code">{a.code}</span>
                    <Badge>{TYPE_LABEL[a.type]}</Badge>
                    <Badge>{SUBTYPE_META[a.subtype].label}</Badge>
                    <Badge tone="info">Saldo normal {side}</Badge>
                  </div>
                </div>
              </div>
              <div className="lm-stats">
                <div>
                  <span>Saldo awal</span>
                  <Money value={view.opening} />
                </div>
                <div>
                  <span>Mutasi debit</span>
                  <Money value={view.totalDebit} />
                </div>
                <div>
                  <span>Mutasi kredit</span>
                  <Money value={view.totalCredit} />
                </div>
                <div>
                  <span>Saldo akhir</span>
                  <Money value={view.closing} className="strong" />
                </div>
              </div>
              <TableWrap label="Buku besar">
                <table className="table ledger-table">
                  <thead>
                    <tr>
                      <th style={{ width: 108 }}>Tanggal</th>
                      <th>Keterangan</th>
                      <th className="r" style={{ width: 132 }}>Debit</th>
                      <th className="r" style={{ width: 132 }}>Kredit</th>
                      <th className="r" style={{ width: 146 }}>Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="lg-open">
                      <td>{formatDate(period.from === '1900-01-01' ? (view.rows[0]?.date ?? today) : period.from)}</td>
                      <td colSpan={3}>
                        <em>Saldo awal periode</em>
                      </td>
                      <td className="r num money-val">{formatMoney(view.opening, { symbol: false })}</td>
                    </tr>
                    {view.rows.map((r, i) => (
                      <tr
                        key={i}
                        className={r.txId ? 'clickable' : undefined}
                        onClick={() => {
                          const t = r.txId ? txById.get(r.txId) : undefined;
                          if (t) editTx(t);
                        }}
                      >
                        <td>{formatDate(r.date)}</td>
                        <td className="lg-desc">
                          <span className="truncate">
                            {r.description}
                            {r.memo && <span className="muted"> · {r.memo}</span>}
                          </span>
                          <span className="lg-sub truncate">
                            <span className="code">{r.ref}</span>
                            {r.counter && <> · {r.counter}</>}
                          </span>
                        </td>
                        <td className="r num money-val">{r.debit ? formatMoney(r.debit, { symbol: false }) : ''}</td>
                        <td className="r num money-val">{r.credit ? formatMoney(r.credit, { symbol: false }) : ''}</td>
                        <td className={`r num money-val strong-num ${r.balance < 0 ? 'neg' : ''}`}>{formatMoney(r.balance, { symbol: false })}</td>
                      </tr>
                    ))}
                    {view.rows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="muted" style={{ textAlign: 'center', height: 64 }}>
                          Tidak ada mutasi pada periode ini
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}>Jumlah mutasi & saldo akhir</td>
                      <td className="r num money-val">{formatMoney(view.totalDebit, { symbol: false })}</td>
                      <td className="r num money-val">{formatMoney(view.totalCredit, { symbol: false })}</td>
                      <td className="r num money-val double-rule">{formatMoney(view.closing, { symbol: false })}</td>
                    </tr>
                  </tfoot>
                </table>
              </TableWrap>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
