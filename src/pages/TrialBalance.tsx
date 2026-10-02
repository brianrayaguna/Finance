import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, CircleCheck, TriangleAlert } from 'lucide-react';
import { useBooks, useToday } from '../hooks/useApp';
import { toast } from '../store/ui';
import { TYPE_LABEL } from '../accounting/coa';
import { trialBalance } from '../accounting/reports';
import { checkIntegrity } from '../accounting/integrity';
import { formatDate, formatMoney } from '../lib/format';
import { PageHeader } from '../components/layout/Topbar';
import { Badge, Button, Dots, IconTile, TableWrap } from '../components/ui/primitives';
import { DatePicker } from '../components/ui/DatePicker';

export default function TrialBalance() {
  const b = useBooks();
  const today = useToday();
  const nav = useNavigate();
  const [to, setTo] = useState(today);
  const [exporting, setExporting] = useState(false);
  const rep = useMemo(() => trialBalance(b, to, b.data.profile.entityName), [b, to]);
  const rows = rep.rows.filter((r) => r.kind === 'account');
  const total = rep.rows.find((r) => r.kind === 'grandtotal');
  const ok = rep.checks?.[0]?.ok;
  const rejected = useMemo(() => checkIntegrity(b.data).filter((i) => i.code === 'not-journalized').length, [b]);

  let lastType = '';

  const doExport = async () => {
    setExporting(true);
    try {
      const { exportReports } = await import('../export/excel');
      await exportReports(b, [rep], `Neraca Saldo ${to}`);
      toast('Neraca saldo diekspor', { tone: 'success' });
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
        title="Neraca Saldo"
        subtitle={`Saldo seluruh akun sebelum penutupan · per ${formatDate(to, 'long')}`}
        actions={
          <>
            <div style={{ width: 230 }}>
              <DatePicker value={to} onChange={setTo} compact />
            </div>
            <Button variant="primary" icon={exporting ? undefined : Download} onClick={doExport} disabled={exporting}>
              {exporting ? <Dots /> : 'Ekspor Excel'}
            </Button>
          </>
        }
      />
      {rejected > 0 && (
        <div className="balance-banner warn">
          <TriangleAlert size={18} />
          <span className="grow">
            {rejected} transaksi tidak masuk buku karena datanya tidak valid (mis. jurnal tidak seimbang atau akun terhapus).
          </span>
          <Button size="sm" variant="ghost" onClick={() => nav('/pengaturan#integritas')}>
            Periksa
          </Button>
        </div>
      )}
      <div className={`balance-banner ${ok ? 'ok' : 'bad'}`}>
        {ok ? <CircleCheck size={18} /> : <TriangleAlert size={18} />}
        <span className="grow">{ok ? 'Neraca saldo seimbang — total debit sama dengan total kredit.' : 'Neraca saldo tidak seimbang.'}</span>
        <span className="num money-val strong">{formatMoney(total?.values[0] ?? 0)}</span>
      </div>
      <div className="card">
        <TableWrap label="Neraca saldo">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 100 }}>Kode</th>
                <th>Nama akun</th>
                <th className="r" style={{ width: 200 }}>Debit</th>
                <th className="r" style={{ width: 200 }}>Kredit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const acc = r.accountId ? b.acc.get(r.accountId) : undefined;
                const t = acc ? TYPE_LABEL[acc.type] : 'Ekuitas';
                const head = t !== lastType ? t : null;
                lastType = t;
                return [
                  head && (
                    <tr key={'h-' + t} className="tb-group">
                      <td colSpan={4}>{head}</td>
                    </tr>
                  ),
                  <tr key={r.key} className={acc ? 'clickable' : undefined} onClick={() => acc && nav(`/buku-besar?akun=${acc.id}`)}>
                    <td className="code">{r.code}</td>
                    <td>
                      <span className="row">
                        {acc && <IconTile icon={acc.icon} color={acc.color} size="xs" />}
                        {r.label}
                        {acc?.archived && <Badge>Arsip</Badge>}
                      </span>
                    </td>
                    <td className="r num money-val">{r.values[0] ? formatMoney(r.values[0], { symbol: false }) : ''}</td>
                    <td className="r num money-val">{r.values[1] ? formatMoney(r.values[1], { symbol: false }) : ''}</td>
                  </tr>,
                ];
              })}
            </tbody>
            <tfoot>
              <tr>
                <td />
                <td>JUMLAH</td>
                <td className="r num money-val double-rule">{formatMoney(total?.values[0] ?? 0, { symbol: false })}</td>
                <td className="r num money-val double-rule">{formatMoney(total?.values[1] ?? 0, { symbol: false })}</td>
              </tr>
            </tfoot>
          </table>
        </TableWrap>
      </div>
    </div>
  );
}
