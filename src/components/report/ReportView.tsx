import { CircleCheck, TriangleAlert } from 'lucide-react';
import { TableWrap } from '../ui/primitives';
import type { Report, ReportColumn, ReportRow } from '../../accounting/types';
import { formatAccounting, formatDate, todayISO } from '../../lib/format';

export function fmtCell(v: number | null | undefined, col: ReportColumn | undefined, row: ReportRow): string {
  if (v === null || v === undefined) return '';
  if (row.unit === 'pct' || col?.unit === 'pct') return `${v.toFixed(1).replace('.', ',')}%`;
  return formatAccounting(v);
}

export function derived(row: ReportRow, col: ReportColumn): string {
  if (!col.of || row.kind === 'section' || row.kind === 'group' || row.kind === 'blank' || row.kind === 'note') return '';
  const a = row.values[col.of[0]];
  const b = row.values[col.of[1]];
  if (a === null || b === null || a === undefined || b === undefined) return '';
  if (col.kind === 'change') return formatAccounting(a - b);
  if (Math.abs(b) < 0.005) return a ? 'baru' : '–';
  const p = ((a - b) / Math.abs(b)) * 100;
  return `${p < 0 ? '(' : ''}${Math.abs(p).toFixed(1).replace('.', ',')}%${p < 0 ? ')' : ''}`;
}

export function ReportView({
  report,
  entity,
  onAccount,
  compact,
}: {
  report: Report;
  entity: string;
  onAccount?: (id: string) => void;
  compact?: boolean;
}) {
  const valueCols = report.columns;
  const multiHeader = report.columns.some((c) => c.sub) && report.id === 'worksheet';
  const period = report.subtitle.split(' · ').slice(1).join(' · ');

  return (
    <div className={`paper${compact ? ' compact' : ''}${report.columns.length > 3 ? ' wide' : ''}`}>
      <div className="paper-head">
        <div className="ph-entity">{entity}</div>
        <div className="ph-title">{report.title}</div>
        <div className="ph-period">{period}</div>
        <div className="ph-unit">(Dinyatakan dalam Rupiah, kecuali dinyatakan lain)</div>
      </div>
      <TableWrap label="Tabel laporan">
        <table className={`stmt cols-${valueCols.length}`}>
          <thead>
            {multiHeader ? (
              <>
                <tr>
                  <th rowSpan={2} className="st-label">
                    Akun
                  </th>
                  {valueCols
                    .filter((_, i) => i % 2 === 0)
                    .map((c, i) => (
                      <th key={i} colSpan={2} className="c grp">
                        {c.label}
                      </th>
                    ))}
                </tr>
                <tr>
                  {valueCols.map((c, i) => (
                    <th key={i} className="r sub">
                      {c.sub}
                    </th>
                  ))}
                </tr>
              </>
            ) : (
              <tr>
                <th className="st-label">{report.id === 'trial-balance' ? 'Akun' : ''}</th>
                {valueCols.map((c, i) => (
                  <th key={i} className="r">
                    <span>{c.label}</span>
                    {c.sub && <span className="th-sub">{c.sub}</span>}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {report.rows.map((r) => {
              if (r.kind === 'blank')
                return (
                  <tr key={r.key} className="k-blank">
                    <td colSpan={valueCols.length + 1} />
                  </tr>
                );
              const clickable = !!r.accountId && !!onAccount;
              return (
                <tr key={r.key} className={`k-${r.kind}${clickable ? ' clickable' : ''}${r.italic ? ' italic' : ''}`} onClick={clickable ? () => onAccount!(r.accountId!) : undefined}>
                  <td className="st-label" style={{ paddingLeft: 12 + r.indent * 18 }}>
                    {r.code && (r.kind === 'account' || report.id === 'aging-ar' || report.id === 'aging-ap') && <span className="st-code">{r.code}</span>}
                    {r.label}
                  </td>
                  {valueCols.map((c, i) => {
                    const txt = c.of ? derived(r, c) : fmtCell(r.values[i], c, r);
                    const neg = txt.startsWith('(');
                    return (
                      <td key={i} className={`r num money-val${neg ? ' neg-acc' : ''}${c.of ? ' derived' : ''}${c.kind === 'percent' ? ' pct' : ''}`}>
                        {txt}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
      {(report.checks?.length || report.notes?.length) && (
        <div className="paper-foot">
          {report.checks?.map((c, i) => (
            <div key={i} className={`check-line ${c.ok ? 'ok' : 'bad'}`}>
              {c.ok ? <CircleCheck size={14} /> : <TriangleAlert size={14} />}
              <span>{c.label}</span>
              {!c.ok && <strong className="num">selisih {formatAccounting(c.diff)}</strong>}
            </div>
          ))}
          {report.notes?.map((n, i) => (
            <div key={'n' + i} className="note-line">
              {n}
            </div>
          ))}
        </div>
      )}
      <div className="paper-sign">Disusun pada {formatDate(todayISO(), 'long')}</div>
    </div>
  );
}
