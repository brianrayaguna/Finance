/*
 * Ekspor Excel berstandar pelaporan keuangan:
 * kop laporan, format akuntansi (negatif dalam kurung), rumus aktif (SUM/SUBTOTAL/rujukan antar-lembar),
 * uji keseimbangan berbasis rumus, pengaturan cetak A4 dengan judul berulang & nomor halaman,
 * panel beku, filter otomatis, sampul dengan ikhtisar & daftar isi berhyperlink.
 */
import ExcelJS from 'exceljs';
import type { Borders, Cell, Fill, Font, Worksheet, Workbook } from 'exceljs';
import { SUBTYPE_META, TYPE_LABEL, normalSide } from '../accounting/coa';
import { TX_META, accumulatedAt, disposalStop, entryTotals } from '../accounting/engine';
import {
  balanceSheet,
  budgetReport,
  cashFlowStatement,
  closingEntries,
  displayBalances,
  equityStatement,
  incomeStatement,
  ledger,
  ratios,
  trialBalance,
  worksheet as worksheetReport,
  agingReport,
  type Books,
  type Ratio,
} from '../accounting/reports';
import { makeDates, makePeriods } from '../accounting/periods';
import type { FixedAsset, JournalEntry, Report, ReportRow, Transaction } from '../accounting/types';
import { formatDate, periodLabel, todayISO, parseISO, round2 } from '../lib/format';

/* ───────── Style constants ───────── */

const INK = 'FF1B1917';
const INK_2 = 'FF48443F';
const INK_3 = 'FF6A6561';
const ACCENT = 'FF163300';
const HEAD_FILL = 'FFF2EEE5';
const TOTAL_FILL = 'FFF9F7F2';
const GRAND_FILL = 'FFECE7DE';
const LINE = 'FFDBD4C7';
const ZEBRA = 'FFFBFAF7';
const POS = 'FF2F6B4E';
const NEG = 'FF9B4A2D';

const FONT = 'Calibri';
const NUM = '#,##0;(#,##0);"–"';
const PCT = '0.0%;(0.0%);"–"';
const DATE = 'dd/mm/yyyy';

const font = (o: Partial<Font> = {}): Partial<Font> => ({ name: FONT, size: 10.5, color: { argb: INK }, ...o });
const fill = (argb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = { style: 'thin' as const, color: { argb: LINE } };
const hair = { style: 'hair' as const, color: { argb: LINE } };
const inkThin = { style: 'thin' as const, color: { argb: INK } };

const colL = (n: number) => {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

const xDate = (iso: string) => {
  const d = parseISO(iso);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};

const safeName = (s: string) => s.replace(/[\\/*?:[\]]/g, '').slice(0, 31);
const qSheet = (s: string) => `'${safeName(s).replace(/'/g, "''")}'`;
const sheetTarget = (s: string, cell: string) => `#${qSheet(s)}!${cell}`;

/** Perluas lebar kolom secukupnya agar nominal panjang atau teks tidak terpotong menjadi ###. */
function fitColumns(ws: Worksheet, fromRow: number, maxWidths: Record<number, number> = {}, toRow = Infinity) {
  const widths = new Map<number, number>();
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber < fromRow || rowNumber > toRow) return;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (cell.isMerged) return;
      const raw =
        cell.value && typeof cell.value === 'object' && 'result' in cell.value
          ? cell.value.result
          : cell.value && typeof cell.value === 'object' && 'text' in cell.value
            ? cell.value.text
            : cell.value;
      let len = 0;
      if (raw instanceof Date) len = 10;
      else if (typeof raw === 'number' && Number.isFinite(raw)) {
        if (cell.numFmt === PCT) len = `${Math.abs(raw * 100).toFixed(1)}%`.length + (raw < 0 ? 2 : 0);
        else if (cell.numFmt === '0.0" bln"') len = `${raw.toFixed(1)} bln`.length;
        else if (cell.numFmt === '0.00"x"') len = `${raw.toFixed(2)}x`.length;
        else len = Math.round(Math.abs(raw)).toLocaleString('en-US').length + (raw < 0 ? 2 : 0);
      } else if (typeof raw === 'string' && raw) {
        len = Math.max(...raw.split('\n').map((s) => s.length));
      }
      if (len > 0) widths.set(colNumber, Math.max(widths.get(colNumber) ?? 0, len + 2));
    });
  });
  for (const [colNumber, measured] of widths) {
    const col = ws.getColumn(colNumber);
    const cur = col.width ?? 10;
    const cap = maxWidths[colNumber] ?? 48;
    if (measured > cur) col.width = Math.min(cap, measured);
  }
}

interface Ctx {
  entity: string;
  owner: string;
  refs: Map<string, Map<string, { cell: string; value: number }>>; // sheet → rowKey → sel kolom nilai pertama
}

function newWorkbook(b: Books, title: string): Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = b.data.profile.name || 'Keuanganku';
  wb.lastModifiedBy = 'Keuanganku';
  wb.company = b.data.profile.entityName;
  wb.title = title;
  wb.subject = 'Laporan Keuangan';
  wb.created = new Date();
  wb.modified = new Date();
  wb.calcProperties.fullCalcOnLoad = true;
  return wb;
}

function addSheet(wb: Workbook, name: string, opts: { landscape?: boolean; tab?: string; freeze?: number; freezeCol?: number } = {}): Worksheet {
  const ws = wb.addWorksheet(safeName(name), {
    properties: { tabColor: { argb: opts.tab ?? ACCENT }, defaultRowHeight: 17 },
    views: [
      {
        showGridLines: false,
        state: opts.freeze || opts.freezeCol ? 'frozen' : 'normal',
        ySplit: opts.freeze ?? 0,
        xSplit: opts.freezeCol ?? 0,
        zoomScale: 100,
      },
    ],
    pageSetup: {
      paperSize: 9,
      orientation: opts.landscape ? 'landscape' : 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.45, right: 0.45, top: 0.6, bottom: 0.65, header: 0.3, footer: 0.3 },
    },
  });
  return ws;
}

function footer(ws: Worksheet, ctx: Ctx, title: string) {
  const esc = (s: string) => s.replace(/&/g, '&&');
  ws.headerFooter.oddFooter = `&L&"Calibri"&8${esc(ctx.entity)}&C&"Calibri"&8${esc(title)}&R&"Calibri"&8Halaman &P dari &N`;
  ws.headerFooter.oddHeader = `&R&"Calibri"&8Dicetak &D`;
}

/** Kop laporan 4 baris + garis aksen. Mengembalikan nomor baris berikutnya. */
function letterhead(ws: Worksheet, ctx: Ctx, title: string, period: string, lastCol: number, unit = '(Dinyatakan dalam Rupiah, kecuali dinyatakan lain)'): number {
  const L = colL(lastCol);
  const put = (r: number, v: string, f: Partial<Font>, h = 18) => {
    ws.mergeCells(`A${r}:${L}${r}`);
    const c = ws.getCell(`A${r}`);
    c.value = v;
    c.font = font(f);
    c.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.getRow(r).height = h;
  };
  put(1, ctx.entity.toUpperCase(), { size: 14, bold: true }, 22);
  put(2, title, { size: 12.5, bold: true, color: { argb: ACCENT } }, 19);
  put(3, period, { size: 10, italic: true, color: { argb: INK_2 } });
  put(4, unit, { size: 8.5, color: { argb: INK_3 } }, 15);
  const bar = ws.getRow(5);
  bar.height = 4;
  for (let c = 1; c <= lastCol; c++) bar.getCell(c).fill = fill(ACCENT);
  ws.getRow(6).height = 8;
  return 7;
}

function headerCell(c: Cell, v: string, align: 'left' | 'right' | 'center' = 'left') {
  c.value = v;
  c.font = font({ bold: true, size: 10, color: { argb: INK } });
  c.fill = fill(HEAD_FILL);
  c.alignment = { vertical: 'middle', horizontal: align, wrapText: true };
  c.border = { top: inkThin, bottom: inkThin };
}

/* ───────── Laporan berbentuk statement ───────── */

function writeReport(wb: Workbook, ctx: Ctx, report: Report, sheetName: string, opts: { tab?: string; landscape?: boolean } = {}): Worksheet {
  const isWS = report.id === 'worksheet';
  const hasCode = ['trial-balance', 'worksheet', 'aging-ar', 'aging-ap'].includes(report.id);
  const codeLabel = report.id.startsWith('aging') ? 'Jatuh Tempo' : 'Kode';
  const labelCol = hasCode ? 2 : 1;
  const firstVal = labelCol + 1;
  const nVal = report.columns.length;
  const lastCol = labelCol + nVal;
  const headerRows = isWS ? 2 : 1;
  const ws = addSheet(wb, sheetName, { landscape: opts.landscape ?? (isWS || nVal > 4), tab: opts.tab, freeze: 6 + headerRows, freezeCol: isWS ? labelCol : 0 });
  footer(ws, ctx, report.title);

  // lebar kolom
  if (hasCode) ws.getColumn(1).width = report.id.startsWith('aging') ? 13 : 10;
  ws.getColumn(labelCol).width = isWS ? 34 : report.id.startsWith('aging') ? 44 : 54;
  for (let i = 0; i < nVal; i++) ws.getColumn(firstVal + i).width = isWS ? 15 : report.columns[i].kind === 'percent' ? 10 : report.columns[i].label.length > 15 ? 20 : 18;

  const period = report.subtitle;
  let r = letterhead(ws, ctx, report.title, period, lastCol);

  // header kolom
  if (isWS) {
    const r1 = ws.getRow(r);
    const r2 = ws.getRow(r + 1);
    if (hasCode) {
      ws.mergeCells(r, 1, r + 1, 1);
      headerCell(r1.getCell(1), 'Kode');
    }
    ws.mergeCells(r, labelCol, r + 1, labelCol);
    headerCell(r1.getCell(labelCol), 'Nama Akun');
    for (let i = 0; i < nVal; i += 2) {
      ws.mergeCells(r, firstVal + i, r, firstVal + i + 1);
      headerCell(r1.getCell(firstVal + i), report.columns[i].label, 'center');
    }
    report.columns.forEach((c, i) => headerCell(r2.getCell(firstVal + i), c.sub ?? '', 'right'));
    r1.height = 20;
    r2.height = 18;
    r += 2;
  } else {
    const hr = ws.getRow(r);
    if (hasCode) headerCell(hr.getCell(1), codeLabel);
    headerCell(hr.getCell(labelCol), report.id === 'trial-balance' ? 'Nama Akun' : 'Keterangan');
    report.columns.forEach((c, i) => headerCell(hr.getCell(firstVal + i), c.sub && nVal <= 4 ? `${c.label}\n${c.sub}` : c.label, 'right'));
    hr.height = report.columns.some((c) => c.sub) && nVal <= 4 ? 30 : report.columns.some((c) => c.label.length > 15) ? 30 : 20;
    r += 1;
  }
  ws.pageSetup.printTitlesRow = `${r - headerRows}:${r - 1}`;

  const rowOf = new Map<string, number>();
  report.rows.forEach((row, i) => rowOf.set(row.key, r + i));
  const refs = new Map<string, { cell: string; value: number }>();
  ctx.refs.set(ws.name, refs);

  const fmtFor = (row: ReportRow, ci: number) => (row.unit === 'pct' || report.columns[ci]?.unit === 'pct' ? PCT : NUM);

  const formulaFor = (row: ReportRow, L: string): string | null => {
    if (!row.formula) return null;
    const plus = row.formula.plus.map((k) => rowOf.get(k)).filter((x): x is number => !!x);
    const minus = (row.formula.minus ?? []).map((k) => rowOf.get(k)).filter((x): x is number => !!x);
    if (!plus.length && !minus.length) return '0';
    const sorted = [...plus].sort((a, b) => a - b);
    const contiguous = !minus.length && sorted.length > 2 && sorted[sorted.length - 1] - sorted[0] === sorted.length - 1;
    if (contiguous) return `SUM(${L}${sorted[0]}:${L}${sorted[sorted.length - 1]})`;
    const parts = [...plus.map((n) => `+${L}${n}`), ...minus.map((n) => `-${L}${n}`)].join('');
    return parts.replace(/^\+/, '') || '0';
  };

  const dataStart = r;
  for (const row of report.rows) {
    const x = ws.getRow(r);
    refs.set(row.key, { cell: `${colL(firstVal)}${r}`, value: row.values[0] ?? 0 });
    if (row.kind === 'blank') {
      x.height = 7;
      r++;
      continue;
    }
    const lc = x.getCell(labelCol);
    lc.value = row.kind === 'section' ? row.label.toUpperCase() : row.label;
    lc.alignment = { horizontal: 'left', indent: Math.min(row.indent * 2, 8), vertical: 'middle', wrapText: false };
    if (hasCode && row.code) {
      const cc = x.getCell(1);
      cc.value = row.code;
      cc.font = font({ size: 9.5, color: { argb: INK_2 } });
      cc.alignment = { horizontal: 'left', vertical: 'middle' };
    }

    const bold = ['section', 'subtotal', 'total', 'grandtotal'].includes(row.kind);
    const italic = row.kind === 'note' || row.italic;
    const baseFont = font({
      bold,
      italic,
      size: row.kind === 'grandtotal' ? 11 : row.kind === 'section' ? 10.5 : 10.5,
      color: { argb: row.kind === 'note' ? INK_3 : row.kind === 'group' ? INK_2 : INK },
    });
    lc.font = row.kind === 'group' ? font({ bold: true, italic: false, color: { argb: INK_2 }, size: 10 }) : baseFont;

    report.columns.forEach((col, ci) => {
      const L = colL(firstVal + ci);
      const cell = x.getCell(firstVal + ci);
      cell.font = baseFont;
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      if (col.of) {
        if (['section', 'group', 'note'].includes(row.kind)) return;
        const A = `${colL(firstVal + col.of[0])}${r}`;
        const B = `${colL(firstVal + col.of[1])}${r}`;
        const a = row.values[col.of[0]] ?? 0;
        const bb = row.values[col.of[1]] ?? 0;
        if (col.kind === 'change') {
          cell.value = { formula: `${A}-${B}`, result: round2(a - bb) };
          cell.numFmt = NUM;
        } else {
          cell.value = { formula: `IF(${B}=0,"",(${A}-${B})/ABS(${B}))`, result: bb ? (a - bb) / Math.abs(bb) : '' };
          cell.numFmt = PCT;
        }
        return;
      }
      if (report.id === 'budget' && ['account', 'subtotal', 'grandtotal'].includes(row.kind)) {
        const A = `${colL(firstVal)}${r}`;
        const B = `${colL(firstVal + 1)}${r}`;
        if (ci === 2) {
          cell.value = { formula: `${A}-${B}`, result: round2((row.values[0] ?? 0) - (row.values[1] ?? 0)) };
          cell.numFmt = NUM;
          return;
        }
        if (ci === 3) {
          const budgetVal = row.values[0] ?? 0;
          const actualVal = row.values[1] ?? 0;
          cell.value = { formula: `IF(${A}=0,"",${B}/${A})`, result: budgetVal ? actualVal / budgetVal : '' };
          cell.numFmt = PCT;
          return;
        }
      }
      const v = row.values[ci];
      if (v === null || v === undefined) return;
      const isPct = fmtFor(row, ci) === PCT;
      const val = isPct ? v / 100 : v;
      const f = formulaFor(row, L);
      if (f) cell.value = { formula: f, result: val };
      else if (row.rowSumColumns && ci === nVal - 1 && nVal > 1) cell.value = { formula: `SUM(${colL(firstVal)}${r}:${colL(firstVal + nVal - 2)}${r})`, result: val };
      else cell.value = val;
      cell.numFmt = isPct ? PCT : NUM;
    });

    // garis & isian
    const valueCells = report.columns.map((_, ci) => x.getCell(firstVal + ci));
    if (row.kind === 'subtotal') valueCells.forEach((c) => (c.border = { top: thin }));
    if (row.kind === 'total') {
      for (let c = 1; c <= lastCol; c++) x.getCell(c).fill = fill(TOTAL_FILL);
      valueCells.forEach((c) => (c.border = { top: inkThin }));
    }
    if (row.kind === 'grandtotal') {
      for (let c = 1; c <= lastCol; c++) x.getCell(c).fill = fill(GRAND_FILL);
      valueCells.forEach((c) => (c.border = { top: inkThin, bottom: { style: 'double', color: { argb: INK } } }));
    }
    if (row.kind === 'account' && (report.id === 'trial-balance' || isWS)) {
      for (let c = 1; c <= lastCol; c++) x.getCell(c).border = { bottom: hair } as Partial<Borders>;
    }
    x.height = row.kind === 'section' ? 20 : row.kind === 'grandtotal' ? 20 : 17;
    r++;
  }
  const dataEnd = r - 1;

  // Kontrol berbasis rumus
  const check = (label: string, a: string, bRef: string) => {
    r++;
    const x = ws.getRow(r);
    const lc = x.getCell(labelCol);
    lc.value = label;
    lc.font = font({ italic: true, size: 9.5, color: { argb: INK_3 } });
    const c = x.getCell(firstVal);
    c.value = { formula: `${a}-${bRef}`, result: 0 };
    c.numFmt = NUM;
    c.font = font({ italic: true, size: 9.5, color: { argb: INK_3 } });
    c.alignment = { horizontal: 'right' };
    const s = x.getCell(firstVal + 1 <= lastCol ? firstVal + 1 : firstVal);
    if (firstVal + 1 <= lastCol) {
      s.value = { formula: `IF(ABS(${colL(firstVal)}${r})<1,"✓ Seimbang","✗ Periksa")`, result: '✓ Seimbang' };
      s.font = font({ bold: true, size: 9.5, color: { argb: POS } });
      s.alignment = { horizontal: 'right' };
    }
  };
  const ref = (k: string, ci = 0) => {
    const n = rowOf.get(k);
    return n ? `${colL(firstVal + ci)}${n}` : null;
  };
  if (report.id === 'balance-sheet' && ref('t-assets') && ref('t-le')) check('Kontrol: Aset − (Liabilitas + Ekuitas)', ref('t-assets')!, ref('t-le')!);
  if (report.id === 'trial-balance' && ref('t-tb', 0)) check('Kontrol: Debit − Kredit', ref('t-tb', 0)!, ref('t-tb', 1)!);
  if (report.id === 'cash-flow' && ref('st-op') && ref('ind-total')) check('Kontrol: Metode langsung − tidak langsung', ref('st-op')!, ref('ind-total')!);
  if (isWS && ref('t-final', 8)) check('Kontrol: Kolom neraca Debit − Kredit', ref('t-final', 8)!, ref('t-final', 9)!);
  const fitEndRow = r;

  // Uji & catatan
  if (report.checks?.length || report.notes?.length) r++;
  for (const c of report.checks ?? []) {
    r++;
    const text = `${c.ok ? '✓' : '✗'} ${c.label}`;
    const rowRef = ws.getRow(r);
    if (lastCol > labelCol) ws.mergeCells(r, labelCol, r, lastCol);
    const x = rowRef.getCell(labelCol);
    x.value = text;
    x.font = font({ size: 9, color: { argb: c.ok ? POS : NEG } });
    x.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    rowRef.height = Math.max(16, Math.ceil(text.length / 80) * 14);
  }
  for (const n of report.notes ?? []) {
    r++;
    const rowRef = ws.getRow(r);
    if (lastCol > labelCol) ws.mergeCells(r, labelCol, r, lastCol);
    const x = rowRef.getCell(labelCol);
    x.value = n;
    x.font = font({ size: 9, italic: true, color: { argb: INK_2 } });
    x.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    rowRef.height = Math.max(16, Math.ceil(n.length / 80) * 14);
  }

  // Anggaran: pewarnaan kondisional kolom "Terpakai" & "Selisih" (guarded ISNUMBER agar sel "" tidak dianggap > 1)
  if (report.id === 'budget' && dataEnd >= dataStart) {
    const uCol = colL(firstVal + 3);
    const vCol = colL(firstVal + 2);
    ws.addConditionalFormatting({
      ref: `${uCol}${dataStart}:${uCol}${dataEnd}`,
      rules: [
        {
          type: 'expression',
          formulae: [`AND(ISNUMBER(${uCol}${dataStart}),${uCol}${dataStart}>1)`],
          priority: 1,
          style: { font: { color: { argb: NEG }, bold: true } },
        },
        {
          type: 'expression',
          formulae: [`AND(ISNUMBER(${uCol}${dataStart}),${uCol}${dataStart}>=0.85,${uCol}${dataStart}<=1)`],
          priority: 2,
          style: { font: { color: { argb: 'FF8F6112' } } },
        },
      ],
    });
    ws.addConditionalFormatting({
      ref: `${vCol}${dataStart}:${vCol}${dataEnd}`,
      rules: [
        {
          type: 'expression',
          formulae: [`AND(ISNUMBER(${vCol}${dataStart}),${vCol}${dataStart}<0)`],
          priority: 3,
          style: { font: { color: { argb: NEG } } },
        },
      ],
    });
  }
  // Rasio & selisih negatif dalam laporan perbandingan → merah
  if (report.columns.some((c) => c.kind === 'change') && dataEnd >= dataStart) {
    const idx = report.columns.findIndex((c) => c.kind === 'change');
    const c1 = colL(firstVal + idx);
    const c2 = colL(firstVal + idx + 1);
    ws.addConditionalFormatting({
      ref: `${c1}${dataStart}:${c1}${dataEnd}`,
      rules: [
        {
          type: 'expression',
          formulae: [`AND(ISNUMBER(${c1}${dataStart}),${c1}${dataStart}<0)`],
          priority: 4,
          style: { font: { color: { argb: NEG } } },
        },
      ],
    });
    ws.addConditionalFormatting({
      ref: `${c2}${dataStart}:${c2}${dataEnd}`,
      rules: [
        {
          type: 'expression',
          formulae: [`AND(ISNUMBER(${c2}${dataStart}),${c2}${dataStart}<0)`],
          priority: 5,
          style: { font: { color: { argb: NEG } } },
        },
      ],
    });
  }
  const caps: Record<number, number> = { [labelCol]: isWS ? 42 : 56 };
  for (let i = 0; i < nVal; i++) caps[firstVal + i] = 24;
  fitColumns(ws, dataStart - headerRows, caps, fitEndRow);
  return ws;
}

/* ───────── Tabel data generik ───────── */

interface ColDef {
  header: string;
  width: number;
  kind?: 'text' | 'date' | 'money' | 'int' | 'pct' | 'code';
  total?: boolean;
  align?: 'left' | 'right' | 'center';
}

function writeTable(
  wb: Workbook,
  ctx: Ctx,
  name: string,
  title: string,
  period: string,
  cols: ColDef[],
  rows: (string | number | Date | null | { formula: string; result: number })[][],
  opts: { landscape?: boolean; tab?: string; rowStyle?: (i: number) => Partial<Font> | undefined } = {},
): Worksheet {
  const ws = addSheet(wb, name, { landscape: opts.landscape ?? cols.length > 6, tab: opts.tab ?? 'FF78736A', freeze: 7 });
  footer(ws, ctx, title);
  cols.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));
  let r = letterhead(ws, ctx, title, period, cols.length);
  const hr = ws.getRow(r);
  cols.forEach((c, i) => headerCell(hr.getCell(i + 1), c.header, c.align ?? (c.kind === 'money' || c.kind === 'int' || c.kind === 'pct' ? 'right' : 'left')));
  hr.height = 22;
  ws.pageSetup.printTitlesRow = `${r}:${r}`;
  const headRow = r;
  r++;
  const first = r;
  rows.forEach((vals, i) => {
    const x = ws.getRow(r);
    const f = opts.rowStyle?.(i);
    vals.forEach((v, ci) => {
      const c = x.getCell(ci + 1);
      const def = cols[ci];
      c.value = v as ExcelJS.CellValue;
      c.font = font({ size: 10, ...(f ?? {}) });
      c.border = { bottom: hair };
      if (i % 2 === 1) c.fill = fill(ZEBRA);
      switch (def.kind) {
        case 'date':
          c.numFmt = DATE;
          c.alignment = { horizontal: 'left' };
          break;
        case 'money':
          c.numFmt = NUM;
          break;
        case 'int':
          c.numFmt = '#,##0';
          break;
        case 'pct':
          c.numFmt = PCT;
          break;
        case 'code':
          c.font = font({ size: 9.5, color: { argb: INK_2 }, ...(f ?? {}) });
          break;
      }
      if (def.align) c.alignment = { horizontal: def.align };
    });
    r++;
  });
  const last = r - 1;
  if (rows.length) {
    ws.autoFilter = { from: { row: headRow, column: 1 }, to: { row: last, column: cols.length } };
    const firstTotal = cols.findIndex((c) => c.total);
    if (firstTotal >= 0) {
      const x = ws.getRow(r);
      cols.forEach((c, ci) => {
        const cell = x.getCell(ci + 1);
        cell.font = font({ bold: true });
        cell.fill = fill(GRAND_FILL);
        cell.border = { top: inkThin, bottom: { style: 'double', color: { argb: INK } } };
        if (c.total) {
          const L = colL(ci + 1);
          const sum = rows.reduce((s, row) => s + (typeof row[ci] === 'number' ? (row[ci] as number) : 0), 0);
          cell.value = { formula: `SUBTOTAL(109,${L}${first}:${L}${last})`, result: round2(sum) };
          cell.numFmt = NUM;
        }
      });
      if (firstTotal > 0) {
        const lab = x.getCell(1);
        lab.value = 'JUMLAH (sesuai filter)';
        lab.alignment = { horizontal: 'left', vertical: 'middle' };
        if (firstTotal > 1) ws.mergeCells(r, 1, r, firstTotal);
      }
      x.height = 20;
    }
  } else {
    const emptyRow = ws.getRow(r);
    if (cols.length > 1) ws.mergeCells(r, 1, r, cols.length);
    const ec = emptyRow.getCell(1);
    ec.value = 'Tidak ada data pada periode ini.';
    ec.font = font({ italic: true, size: 10, color: { argb: INK_3 } });
    ec.alignment = { horizontal: 'left', vertical: 'middle' };
    emptyRow.height = 20;
  }
  const caps: Record<number, number> = {};
  cols.forEach((c, i) => {
    caps[i + 1] = c.kind === 'money' || c.kind === 'int' ? 24 : Math.max(c.width + 12, 48);
  });
  fitColumns(ws, headRow, caps);
  return ws;
}

/* ───────── Lembar-lembar khusus ───────── */

function writeTransactions(wb: Workbook, ctx: Ctx, b: Books, txs: Transaction[], period: string) {
  const acc = (id?: string) => (id ? b.acc.get(id)?.name ?? '' : '');
  const byId = new Map(b.data.transactions.map((t) => [t.id, t]));
  const sorted = [...txs].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.createdAt - y.createdAt));
  const rows = sorted.map((t, i) => {
    const total = t.amount + (t.fee || 0) + (t.interest || 0);
    const walletDebt = t.counter !== 'category' && t.counter !== 'opening' && !!t.accountId;
    const inflow = ['income', 'receivable_collect'].includes(t.type) || (t.type === 'payable_new' && walletDebt);
    const outflow = ['expense', 'payable_pay'].includes(t.type) || (t.type === 'receivable_new' && walletDebt);
    const contact = t.contact || (t.parentId ? byId.get(t.parentId)?.contact : '') || '';
    return [
      i + 1,
      xDate(t.date),
      t.time ?? '',
      t.ref,
      TX_META[t.type].label,
      t.description || '',
      acc(t.categoryId),
      acc(t.accountId),
      acc(t.toAccountId),
      contact,
      inflow ? total : 0,
      outflow ? total : 0,
      !inflow && !outflow ? total : 0,
      t.note ?? '',
    ];
  });
  return writeTable(
    wb,
    ctx,
    'Transaksi',
    'Daftar Transaksi',
    period,
    [
      { header: 'No.', width: 6, kind: 'int' },
      { header: 'Tanggal', width: 12, kind: 'date' },
      { header: 'Waktu', width: 8, align: 'center' },
      { header: 'No. Bukti', width: 17, kind: 'code' },
      { header: 'Jenis', width: 18 },
      { header: 'Keterangan', width: 34 },
      { header: 'Kategori', width: 22 },
      { header: 'Akun', width: 18 },
      { header: 'Akun Tujuan', width: 16 },
      { header: 'Kontak', width: 18 },
      { header: 'Kas Masuk', width: 16, kind: 'money', total: true },
      { header: 'Kas Keluar', width: 16, kind: 'money', total: true },
      { header: 'Non-kas / Netral', width: 16, kind: 'money', total: true },
      { header: 'Catatan', width: 28 },
    ],
    rows,
    { landscape: true, tab: 'FF3B6A96' },
  );
}

function writeJournal(wb: Workbook, ctx: Ctx, b: Books, entries: JournalEntry[], period: string, sheet = 'Jurnal Umum') {
  const ws = addSheet(wb, sheet, { landscape: true, tab: 'FF57609F', freeze: 7 });
  footer(ws, ctx, sheet);
  const widths = [12, 20, 10, 36, 40, 17, 17];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  let r = letterhead(ws, ctx, sheet, period, 7);
  const hr = ws.getRow(r);
  ['Tanggal', 'No. Bukti', 'Kode', 'Nama Akun', 'Keterangan', 'Debit', 'Kredit'].forEach((h, i) => headerCell(hr.getCell(i + 1), h, i >= 5 ? 'right' : 'left'));
  hr.height = 20;
  ws.pageSetup.printTitlesRow = `${r}:${r}`;
  const headRow = r;
  r++;
  const first = r;
  let totD = 0;
  let totC = 0;
  for (const e of entries) {
    const t = entryTotals(e);
    totD += t.debit;
    totC += t.credit;
    const lines = [...e.lines].sort((x, y) => (x.debit ? 0 : 1) - (y.debit ? 0 : 1));
    lines.forEach((l, i) => {
      const x = ws.getRow(r);
      const a = b.acc.get(l.accountId);
      if (i === 0) {
        x.getCell(1).value = xDate(e.date);
        x.getCell(1).numFmt = DATE;
        x.getCell(2).value = e.ref + (e.adjusting ? ' (AJP)' : '');
        x.getCell(5).value = l.memo ? `${e.description}, ${l.memo}` : e.description;
      } else if (l.memo) x.getCell(5).value = l.memo;
      x.getCell(3).value = a?.code ?? '';
      x.getCell(4).value = a?.name ?? '';
      x.getCell(4).alignment = { horizontal: 'left', indent: l.credit ? 3 : 0 };
      x.getCell(6).value = l.debit || null;
      x.getCell(7).value = l.credit || null;
      for (let c = 1; c <= 7; c++) {
        const cell = x.getCell(c);
        cell.font = font({ size: 10, color: { argb: c === 3 || c === 2 ? INK_2 : INK }, italic: c === 5 && i > 0 });
        if (c >= 6) cell.numFmt = NUM;
        if (i === lines.length - 1) cell.border = { bottom: thin };
      }
      r++;
    });
  }
  const last = r - 1;
  if (!entries.length) {
    const emptyRow = ws.getRow(r);
    ws.mergeCells(r, 1, r, 7);
    emptyRow.getCell(1).value = 'Tidak ada entri jurnal pada periode ini.';
    emptyRow.getCell(1).font = font({ italic: true, size: 10, color: { argb: INK_3 } });
    emptyRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    emptyRow.height = 20;
    r++;
  }
  const totalRow = r;
  const x = ws.getRow(totalRow);
  x.getCell(4).value = 'JUMLAH';
  x.getCell(6).value = entries.length ? { formula: `SUM(F${first}:F${last})`, result: round2(totD) } : 0;
  x.getCell(7).value = entries.length ? { formula: `SUM(G${first}:G${last})`, result: round2(totC) } : 0;
  for (let c = 1; c <= 7; c++) {
    const cell = x.getCell(c);
    cell.font = font({ bold: true });
    cell.fill = fill(GRAND_FILL);
    cell.border = { top: inkThin, bottom: { style: 'double', color: { argb: INK } } };
    if (c >= 6) cell.numFmt = NUM;
  }
  x.height = 20;
  r = totalRow + 2;
  const k = ws.getRow(r);
  const diff = round2(totD - totC);
  const balanced = Math.abs(diff) < 1;
  k.getCell(4).value = 'Kontrol: Debit − Kredit';
  k.getCell(4).font = font({ italic: true, size: 9.5, color: { argb: INK_3 } });
  k.getCell(6).value = { formula: `F${totalRow}-G${totalRow}`, result: diff };
  k.getCell(6).numFmt = NUM;
  k.getCell(6).font = font({ italic: true, size: 9.5, color: { argb: INK_3 } });
  k.getCell(6).alignment = { horizontal: 'right' };
  k.getCell(7).value = { formula: `IF(ABS(F${r})<1,"✓ Seimbang","✗ Periksa")`, result: balanced ? '✓ Seimbang' : '✗ Periksa' };
  k.getCell(7).font = font({ bold: true, size: 9.5, color: { argb: balanced ? POS : NEG } });
  k.getCell(7).alignment = { horizontal: 'right' };
  fitColumns(ws, headRow, { 2: 26, 4: 44, 5: 52, 6: 24, 7: 24 });
  return ws;
}

function writeClosing(wb: Workbook, ctx: Ctx, b: Books, from: string, to: string) {
  const list = closingEntries(b, { from, to, label: '' });
  const entries: JournalEntry[] = list.map((e) => ({
    id: 'c' + e.no,
    date: to,
    ref: `JPT-${e.no}`,
    description: e.title,
    lines: e.lines.map((l) => ({ accountId: l.accountId ?? '', debit: l.debit, credit: l.credit })),
    source: 'tx',
    sort: e.no,
  }));
  return writeJournal(wb, ctx, b, entries, `Per ${formatDate(to, 'long')}`, 'Jurnal Penutup');
}

function writeLedger(wb: Workbook, ctx: Ctx, b: Books, from: string, to: string, ids?: string[]) {
  const ws = addSheet(wb, 'Buku Besar', { landscape: true, tab: 'FF2E7F80', freeze: 7 });
  footer(ws, ctx, 'Buku Besar');
  [12, 17, 42, 30, 17, 17, 18].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  let r = letterhead(ws, ctx, 'Buku Besar', `Untuk periode ${periodLabel(from, to)}`, 7);
  const hr = ws.getRow(r);
  ['Tanggal', 'No. Bukti', 'Keterangan', 'Akun Lawan', 'Debit', 'Kredit', 'Saldo'].forEach((h, i) => headerCell(hr.getCell(i + 1), h, i >= 4 ? 'right' : 'left'));
  hr.height = 20;
  ws.pageSetup.printTitlesRow = `${r}:${r}`;
  const headRow = r;
  r += 2;
  const accounts = (ids ? ids.map((id) => b.acc.get(id)!).filter(Boolean) : b.accounts).filter((a) => a.subtype !== 'income_summary');
  let written = 0;
  for (const a of accounts) {
    const v = ledger(b, a.id, from, to);
    if (!v) continue;
    if (!ids && !v.rows.length && Math.abs(v.opening) < 0.005) continue;
    written++;
    const debitNormal = normalSide(a) === 'debit';
    // judul akun
    const t = ws.getRow(r);
    ws.mergeCells(r, 1, r, 7);
    t.getCell(1).value = `${a.code}  ${a.name} (${SUBTYPE_META[a.subtype].label}), saldo normal ${debitNormal ? 'debit' : 'kredit'}`;
    t.getCell(1).font = font({ bold: true, size: 10.5, color: { argb: INK } });
    t.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    t.getCell(1).fill = fill(HEAD_FILL);
    t.getCell(1).border = { top: thin, bottom: thin };
    t.height = 20;
    r++;
    const o = ws.getRow(r);
    o.getCell(1).value = xDate(from);
    o.getCell(1).numFmt = DATE;
    o.getCell(3).value = 'Saldo awal';
    o.getCell(3).font = font({ italic: true, size: 10 });
    o.getCell(7).value = v.opening;
    o.getCell(7).numFmt = NUM;
    o.getCell(7).font = font({ italic: true, size: 10 });
    const openRow = r;
    r++;
    for (const row of v.rows) {
      const x = ws.getRow(r);
      x.getCell(1).value = xDate(row.date);
      x.getCell(1).numFmt = DATE;
      x.getCell(2).value = row.ref;
      x.getCell(3).value = row.description + (row.memo ? `, ${row.memo}` : '');
      x.getCell(4).value = row.counter;
      x.getCell(5).value = row.debit || null;
      x.getCell(6).value = row.credit || null;
      x.getCell(7).value = { formula: debitNormal ? `G${r - 1}+N(E${r})-N(F${r})` : `G${r - 1}-N(E${r})+N(F${r})`, result: row.balance };
      for (let c = 1; c <= 7; c++) {
        const cell = x.getCell(c);
        cell.font = font({ size: 10, color: { argb: c === 2 || c === 4 ? INK_2 : INK } });
        cell.border = { bottom: hair };
        if (c >= 5) cell.numFmt = NUM;
      }
      r++;
    }
    const s = ws.getRow(r);
    s.getCell(3).value = 'Jumlah mutasi & saldo akhir';
    const hasRows = r - 1 > openRow;
    s.getCell(5).value = hasRows ? { formula: `SUM(E${openRow + 1}:E${r - 1})`, result: v.totalDebit } : 0;
    s.getCell(6).value = hasRows ? { formula: `SUM(F${openRow + 1}:F${r - 1})`, result: v.totalCredit } : 0;
    s.getCell(7).value = { formula: `G${r - 1}`, result: v.closing };
    for (let c = 1; c <= 7; c++) {
      const cell = s.getCell(c);
      cell.font = font({ bold: true, size: 10 });
      cell.fill = fill(TOTAL_FILL);
      cell.border = { top: inkThin, bottom: { style: 'double', color: { argb: INK } } };
      if (c >= 5) cell.numFmt = NUM;
    }
    r += 3;
  }
  if (!written) {
    const emptyRow = ws.getRow(r);
    ws.mergeCells(r, 1, r, 7);
    emptyRow.getCell(1).value = 'Tidak ada saldo atau mutasi akun pada periode ini.';
    emptyRow.getCell(1).font = font({ italic: true, size: 10, color: { argb: INK_3 } });
    emptyRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    emptyRow.height = 20;
  }
  fitColumns(ws, headRow, { 3: 50, 4: 38, 5: 24, 6: 24, 7: 24 });
  return ws;
}

function writeRatios(wb: Workbook, ctx: Ctx, list: Ratio[], from: string, to: string) {
  const fmtVal = (r: Ratio) => (r.value === null ? '—' : r.value);
  const status = { good: 'Sehat', warn: 'Perlu perhatian', bad: 'Lemah', na: 'Tidak tersedia' };
  const ws = writeTable(
    wb,
    ctx,
    'Rasio Keuangan',
    'Analisis Rasio Keuangan',
    `Periode ${formatDate(from, 'long')} – ${formatDate(to, 'long')}`,
    [
      { header: 'Kelompok', width: 20 },
      { header: 'Rasio', width: 32 },
      { header: 'Nilai', width: 14, align: 'right' },
      { header: 'Acuan', width: 12, align: 'center' },
      { header: 'Status', width: 18 },
      { header: 'Rumus', width: 58 },
    ],
    list.map((r) => [r.group, r.name, fmtVal(r), r.benchmark, status[r.status], r.formula]),
    { landscape: true, tab: 'FF85578F' },
  );
  list.forEach((r, i) => {
    const c = ws.getRow(8 + i).getCell(3);
    if (r.value !== null) {
      c.numFmt = r.unit === '%' ? PCT : r.unit === 'bulan' ? '0.0" bln"' : '0.00"x"';
    } else {
      c.font = font({ size: 10, color: { argb: INK_3 } });
      c.alignment = { horizontal: 'right' };
    }
    const s = ws.getRow(8 + i).getCell(5);
    s.font = font({ size: 10, bold: true, color: { argb: r.status === 'good' ? POS : r.status === 'bad' ? NEG : r.status === 'warn' ? 'FF8F6112' : INK_3 } });
  });
  fitColumns(ws, 7, { 3: 18, 6: 64 });
  return ws;
}

function writeAssets(wb: Workbook, ctx: Ctx, b: Books, to: string) {
  type CellVal = string | number | Date | null;
  const toRow = (a: FixedAsset, acc: number, statusLabel: string): CellVal[] => {
    const nonDep = a.depreciable === false;
    return [
      a.ref,
      a.name,
      b.acc.get(a.accountId)?.name ?? '',
      xDate(a.acquisitionDate),
      a.cost,
      nonDep ? null : a.residualValue,
      nonDep ? null : a.usefulLifeMonths,
      nonDep ? 'Tidak disusutkan' : a.method === 'straight_line' ? 'Garis lurus' : 'Saldo menurun ganda',
      acc,
      round2(a.cost - acc),
      statusLabel,
    ];
  };

  const activeRows: CellVal[][] = [];
  const otherRows: CellVal[][] = [];
  for (const a of b.data.assets) {
    const stop = disposalStop(a);
    const future = a.acquisitionDate > to;
    const disposedByTo = !!(stop && stop <= to);
    const nonDep = a.depreciable === false;
    if (future) {
      otherRows.push(toRow(a, 0, 'Belum berlaku'));
      continue;
    }
    if (disposedByTo) {
      const acc = accumulatedAt(a, stop!);
      otherRows.push(toRow(a, acc, `Dilepas ${formatDate(stop!)}`));
      continue;
    }
    const acc = accumulatedAt(a, to);
    const statusLabel = stop
      ? `Dijadwalkan dilepas ${formatDate(stop)}`
      : nonDep
        ? 'Tidak disusutkan'
        : a.cost - acc - a.residualValue <= 0.005
          ? 'Habis disusutkan'
          : 'Aktif';
    activeRows.push(toRow(a, acc, statusLabel));
  }

  const ws = writeTable(
    wb,
    ctx,
    'Aset Tetap',
    'Register Aset Tetap',
    `Per ${formatDate(to, 'long')}`,
    [
      { header: 'No. Bukti', width: 16, kind: 'code' },
      { header: 'Nama Aset', width: 28 },
      { header: 'Kelompok', width: 22 },
      { header: 'Tgl Perolehan', width: 13, kind: 'date' },
      { header: 'Harga Perolehan', width: 17, kind: 'money', total: true },
      { header: 'Nilai Sisa', width: 14, kind: 'money', total: true },
      { header: 'Umur (bln)', width: 10, kind: 'int' },
      { header: 'Metode', width: 18 },
      { header: 'Akum. Penyusutan', width: 17, kind: 'money', total: true },
      { header: 'Nilai Buku', width: 17, kind: 'money', total: true },
      { header: 'Status', width: 22 },
    ],
    activeRows,
    { landscape: true, tab: 'FF8A6546' },
  );

  // Cantumkan aset yang sudah dilepas per `to` atau belum berlaku di bagian terpisah agar tidak menggeser total neraca.
  if (otherRows.length) {
    let r = (ws.lastRow?.number ?? 7) + 2;
    const titleRow = ws.getRow(r);
    ws.mergeCells(r, 1, r, 11);
    titleRow.getCell(1).value = 'Aset Telah Dilepas / Belum Berlaku pada Tanggal Laporan (di luar saldo neraca)';
    titleRow.getCell(1).font = font({ bold: true, italic: true, size: 10, color: { argb: INK_2 } });
    titleRow.height = 18;
    r++;
    for (const vals of otherRows) {
      const row = ws.getRow(r++);
      vals.forEach((v, ci) => {
        const c = row.getCell(ci + 1);
        c.value = v as ExcelJS.CellValue;
        c.font = font({ size: 9.5, color: { argb: INK_3 } });
        c.border = { bottom: hair };
        if (ci === 3) {
          c.numFmt = DATE;
          c.alignment = { horizontal: 'left' };
        } else if (ci === 4 || ci === 5 || ci === 8 || ci === 9) {
          c.numFmt = NUM;
        } else if (ci === 6) {
          c.numFmt = '#,##0';
        }
      });
    }
  }
  return ws;
}

function writeCoa(wb: Workbook, ctx: Ctx, b: Books, to: string) {
  const balOf = displayBalances(b, to);
  const rows = b.accounts
    .filter((a) => a.subtype !== 'income_summary')
    .map((a) => [a.code, a.name, TYPE_LABEL[a.type], SUBTYPE_META[a.subtype].label, normalSide(a) === 'debit' ? 'Debit' : 'Kredit', balOf(a), a.archived ? 'Arsip' : a.system ? 'Sistem' : 'Aktif']);
  return writeTable(
    wb,
    ctx,
    'Bagan Akun',
    'Bagan Akun (Chart of Accounts)',
    `Saldo per ${formatDate(to, 'long')}`,
    [
      { header: 'Kode', width: 10, kind: 'code' },
      { header: 'Nama Akun', width: 34 },
      { header: 'Tipe', width: 14 },
      { header: 'Kelompok', width: 26 },
      { header: 'Saldo Normal', width: 13, align: 'center' },
      { header: 'Saldo', width: 18, kind: 'money' },
      { header: 'Status', width: 10 },
    ],
    rows,
    { tab: 'FF78736A' },
  );
}

/* ───────── Sampul ───────── */

function writeCover(ws: Worksheet, ctx: Ctx, from: string, to: string, toc: { sheet: string; desc: string }[]) {
  ws.views = [{ showGridLines: false }];
  ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1, horizontalCentered: true, margins: { left: 0.6, right: 0.6, top: 0.8, bottom: 0.8, header: 0.3, footer: 0.3 } };
  [3, 6, 40, 22, 44].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const put = (addr: string, v: ExcelJS.CellValue, f: Partial<Font>, h?: number) => {
    const c = ws.getCell(addr);
    c.value = v;
    c.font = font(f);
    if (h) ws.getRow(Number(addr.replace(/\D/g, ''))).height = h;
    return c;
  };
  for (let c = 2; c <= 5; c++) ws.getRow(2).getCell(c).fill = fill(ACCENT);
  ws.getRow(2).height = 6;
  for (const rowNum of [4, 5, 6, 7]) ws.mergeCells(`B${rowNum}:E${rowNum}`);
  put('B4', 'LAPORAN KEUANGAN', { size: 24, bold: true }, 34).alignment = { vertical: 'middle', horizontal: 'left' };
  put('B5', ctx.entity, { size: 16, color: { argb: ACCENT }, bold: true }, 24).alignment = { vertical: 'middle', horizontal: 'left' };
  put('B6', `Untuk periode ${periodLabel(from, to)}`, { size: 11, color: { argb: INK_2 } }, 18).alignment = { vertical: 'middle', horizontal: 'left' };
  put('B7', `Disusun oleh ${ctx.owner || '—'}, ${formatDate(todayISO(), 'long')}`, { size: 9.5, color: { argb: INK_3 } }, 16).alignment = { vertical: 'middle', horizontal: 'left' };

  let r = 10;
  const kpis: [string, string, string][] = [
    ['Laba Rugi', 'st-rev', 'Pendapatan utama'],
    ['Laba Rugi', 't-op', 'Laba (rugi) operasional'],
    ['Laba Rugi', 't-net', 'Laba (rugi) bersih'],
    ['Posisi Keuangan', 't-assets', 'Jumlah aset'],
    ['Posisi Keuangan', 't-liab', 'Jumlah liabilitas'],
    ['Posisi Keuangan', 't-eq', 'Jumlah ekuitas'],
    ['Arus Kas', 'st-op', 'Kas bersih dari aktivitas operasi'],
    ['Arus Kas', 't-end', 'Kas dan setara kas akhir periode'],
  ];
  const kpiHits = kpis
    .map(([sheet, key, label]) => ({ sheet, key, label, hit: ctx.refs.get(safeName(sheet))?.get(key) }))
    .filter((x): x is { sheet: string; key: string; label: string; hit: { cell: string; value: number } } => !!x.hit);

  if (kpiHits.length > 0) {
    put(`B${r}`, 'IKHTISAR KEUANGAN', { size: 10.5, bold: true, color: { argb: INK_2 } }, 20);
    r++;
    for (const { sheet, key, label, hit } of kpiHits) {
      const cellRef = hit.cell;
      const x = ws.getRow(r);
      x.getCell(3).value = label;
      x.getCell(3).font = font({ size: 10.5 });
      const v = x.getCell(4);
      v.value = { formula: `${qSheet(sheet)}!${cellRef}`, result: hit.value };
      v.numFmt = NUM;
      v.font = font({ size: 10.5, bold: key === 't-net' || key === 't-end' });
      v.alignment = { horizontal: 'right' };
      const s = x.getCell(5);
      s.value = { text: `→ ${sheet}`, hyperlink: sheetTarget(sheet, cellRef) };
      s.font = font({ size: 9, color: { argb: INK_3 }, underline: false });
      for (const c of [3, 4, 5]) x.getCell(c).border = { bottom: hair };
      x.height = 19;
      r++;
    }
    r += 2;
  }

  put(`B${r}`, 'DAFTAR ISI', { size: 10.5, bold: true, color: { argb: INK_2 } }, 20);
  r++;
  const hr = ws.getRow(r);
  headerCell(hr.getCell(2), 'No.', 'center');
  headerCell(hr.getCell(3), 'Lembar kerja');
  headerCell(hr.getCell(4), 'Isi');
  headerCell(hr.getCell(5), 'Isi');
  hr.height = 22;
  ws.mergeCells(r, 4, r, 5);
  r++;
  toc.forEach((t, i) => {
    const x = ws.getRow(r);
    x.getCell(2).value = i + 1;
    x.getCell(2).alignment = { horizontal: 'center' };
    x.getCell(2).font = font({ size: 10, color: { argb: INK_2 } });
    x.getCell(3).value = { text: t.sheet, hyperlink: sheetTarget(t.sheet, 'A1') };
    x.getCell(3).font = font({ size: 10.5, color: { argb: 'FF2E5A7E' }, underline: true });
    x.getCell(4).value = t.desc;
    x.getCell(4).font = font({ size: 9.5, color: { argb: INK_2 } });
    x.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };
    for (const c of [2, 3, 4, 5]) x.getCell(c).border = { bottom: hair };
    ws.mergeCells(r, 4, r, 5);
    x.height = 18;
    r++;
  });
  r += 2;
  put(`B${r}`, 'Seluruh angka dalam Rupiah. Nilai negatif ditampilkan dalam tanda kurung. Subtotal dan total menggunakan rumus aktif sehingga dapat ditelusuri.', { size: 8.5, italic: true, color: { argb: INK_3 } });
  ws.mergeCells(`B${r}:E${r}`);
  ws.getCell(`B${r}`).alignment = { wrapText: true, vertical: 'top' };
  ws.getRow(r).height = 26;
}

/* ───────── Unduh ───────── */

async function download(wb: Workbook, base: string) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${base.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const ctxOf = (b: Books): Ctx => ({ entity: b.data.profile.entityName || 'Buku Keuangan', owner: b.data.profile.name, refs: new Map() });

const REPORT_SHEET: Record<string, { name: string; tab: string }> = {
  'income-statement': { name: 'Laba Rugi', tab: 'FF4C8A58' },
  'balance-sheet': { name: 'Posisi Keuangan', tab: 'FF3B6A96' },
  'cash-flow': { name: 'Arus Kas', tab: 'FF2E7F80' },
  equity: { name: 'Perubahan Ekuitas', tab: 'FFB8603C' },
  'trial-balance': { name: 'Neraca Saldo', tab: 'FF78736A' },
  worksheet: { name: 'Neraca Lajur', tab: 'FF57609F' },
  budget: { name: 'Anggaran', tab: 'FFC8792C' },
  'aging-ar': { name: 'Umur Piutang', tab: 'FF2E7F80' },
  'aging-ap': { name: 'Umur Hutang', tab: 'FFC8792C' },
};

/* ───────── API publik ───────── */

export async function exportReports(b: Books, reports: Report[], base: string) {
  const wb = newWorkbook(b, base);
  const ctx = ctxOf(b);
  for (const r of reports) {
    const meta = REPORT_SHEET[r.id] ?? { name: r.title, tab: ACCENT };
    writeReport(wb, ctx, r, meta.name, { tab: meta.tab });
  }
  await download(wb, `${ctx.entity} - ${base}`);
}

export async function exportRatios(b: Books, list: Ratio[], p: { from: string; to: string }) {
  const wb = newWorkbook(b, 'Rasio Keuangan');
  const ctx = ctxOf(b);
  writeRatios(wb, ctx, list, p.from, p.to);
  await download(wb, `${ctx.entity} - Rasio Keuangan ${p.to}`);
}

export async function exportTransactions(b: Books, txs: Transaction[], p: { from: string; to: string }) {
  const wb = newWorkbook(b, 'Daftar Transaksi');
  const ctx = ctxOf(b);
  const from = p.from === '1900-01-01' ? txs.reduce((m, t) => (t.date < m ? t.date : m), txs[0]?.date ?? todayISO()) : p.from;
  const to = p.to === '2999-12-31' ? txs.reduce((m, t) => (t.date > m ? t.date : m), txs[0]?.date ?? todayISO()) : p.to;
  writeTransactions(wb, ctx, b, txs, `Periode ${periodLabel(from, to)}, ${txs.length} transaksi`);
  await download(wb, `${ctx.entity} - Transaksi ${from} sd ${to}`);
}

export async function exportJournal(b: Books, entries: JournalEntry[], p: { from: string; to: string }) {
  const wb = newWorkbook(b, 'Jurnal Umum');
  const ctx = ctxOf(b);
  const from = p.from === '1900-01-01' ? entries.reduce((m, e) => (e.date < m ? e.date : m), entries[0]?.date ?? todayISO()) : p.from;
  const to = p.to === '2999-12-31' ? entries.reduce((m, e) => (e.date > m ? e.date : m), entries[0]?.date ?? todayISO()) : p.to;
  writeJournal(wb, ctx, b, entries, `Untuk periode ${periodLabel(from, to)}`);
  await download(wb, `${ctx.entity} - Jurnal Umum ${from} sd ${to}`);
}

export async function exportLedger(b: Books, p: { from: string; to: string }, ids?: string[]) {
  const wb = newWorkbook(b, 'Buku Besar');
  const ctx = ctxOf(b);
  const from = p.from === '1900-01-01' ? b.entries.reduce((m, e) => (e.date < m ? e.date : m), b.entries[0]?.date ?? todayISO()) : p.from;
  const to = p.to === '2999-12-31' ? b.entries.reduce((m, e) => (e.date > m ? e.date : m), b.entries[0]?.date ?? todayISO()) : p.to;
  writeLedger(wb, ctx, b, from, to, ids);
  const name = ids?.length === 1 ? b.acc.get(ids[0])?.name ?? 'Akun' : 'Semua Akun';
  await download(wb, `${ctx.entity} - Buku Besar ${name} ${from} sd ${to}`);
}

export async function exportPackage(b: Books, o: { from: string; to: string; compare: boolean; include: Set<string> }) {
  const { from, to, compare, include } = o;
  const wb = newWorkbook(b, 'Laporan Keuangan');
  const ctx = ctxOf(b);
  const P = { from, to, label: periodLabel(from, to) };
  const cover = addSheet(wb, 'Sampul', { tab: INK });
  const toc: { sheet: string; desc: string }[] = [];
  const add = (sheet: string, desc: string) => toc.push({ sheet, desc });

  // Laporan utama selalu dibangun lebih dulu agar ikhtisar sampul dapat merujuk selnya
  if (include.has('laba-rugi')) {
    writeReport(wb, ctx, incomeStatement(b, makePeriods(from, to, compare), ctx.entity), 'Laba Rugi', { tab: 'FF4C8A58' });
    add('Laba Rugi', 'Pendapatan, beban, laba operasional, dan laba bersih');
  }
  if (include.has('neraca')) {
    writeReport(wb, ctx, balanceSheet(b, makeDates(to, compare, from), ctx.entity), 'Posisi Keuangan', { tab: 'FF3B6A96' });
    add('Posisi Keuangan', 'Aset, liabilitas, dan ekuitas pada akhir periode');
  }
  if (include.has('arus-kas')) {
    writeReport(wb, ctx, cashFlowStatement(b, makePeriods(from, to, compare), ctx.entity), 'Arus Kas', { tab: 'FF2E7F80' });
    add('Arus Kas', 'Metode langsung dengan rekonsiliasi metode tidak langsung');
  }
  if (include.has('ekuitas')) {
    writeReport(wb, ctx, equityStatement(b, P, ctx.entity), 'Perubahan Ekuitas', { tab: 'FFB8603C', landscape: true });
    add('Perubahan Ekuitas', 'Mutasi modal, prive, dan saldo laba');
  }
  if (include.has('rasio')) {
    writeRatios(wb, ctx, ratios(b, P), from, to);
    add('Rasio Keuangan', 'Likuiditas, solvabilitas, profitabilitas, kesehatan keuangan');
  }
  if (include.has('anggaran')) {
    writeReport(wb, ctx, budgetReport(b, P, ctx.entity), 'Anggaran', { tab: 'FFC8792C' });
    add('Anggaran', 'Anggaran vs realisasi per kategori beban');
  }
  if (include.has('umur-piutang')) {
    writeReport(wb, ctx, agingReport(b.data, 'receivable', to, ctx.entity), 'Umur Piutang', { tab: 'FF2E7F80', landscape: true });
    add('Umur Piutang', 'Pengelompokan piutang berdasarkan umur jatuh tempo');
  }
  if (include.has('umur-hutang')) {
    writeReport(wb, ctx, agingReport(b.data, 'payable', to, ctx.entity), 'Umur Hutang', { tab: 'FFC8792C', landscape: true });
    add('Umur Hutang', 'Pengelompokan hutang berdasarkan umur jatuh tempo');
  }
  if (include.has('neraca-saldo')) {
    writeReport(wb, ctx, trialBalance(b, to, ctx.entity), 'Neraca Saldo', { tab: 'FF78736A' });
    add('Neraca Saldo', 'Saldo debit dan kredit seluruh akun sebelum penutupan');
  }
  if (include.has('lajur')) {
    writeReport(wb, ctx, worksheetReport(b, P, ctx.entity), 'Neraca Lajur', { tab: 'FF57609F', landscape: true });
    add('Neraca Lajur', 'Kertas kerja 10 kolom: NS, penyesuaian, NSD, laba rugi, neraca');
  }
  if (include.has('jurnal')) {
    writeJournal(wb, ctx, b, b.entries.filter((e) => e.date >= from && e.date <= to), `Untuk periode ${periodLabel(from, to)}`);
    add('Jurnal Umum', 'Seluruh jurnal periode berjalan termasuk penyesuaian');
  }
  if (include.has('penutup')) {
    writeClosing(wb, ctx, b, from, to);
    add('Jurnal Penutup', 'Penutupan akun nominal ke saldo laba');
  }
  if (include.has('buku-besar')) {
    writeLedger(wb, ctx, b, from, to);
    add('Buku Besar', 'Mutasi dan saldo berjalan per akun dengan rumus');
  }
  if (include.has('transaksi')) {
    writeTransactions(wb, ctx, b, b.data.transactions.filter((t) => t.date >= from && t.date <= to), `Periode ${periodLabel(from, to)}`);
    add('Transaksi', 'Daftar transaksi dengan filter dan subtotal otomatis');
  }
  if (include.has('aset')) {
    writeAssets(wb, ctx, b, to);
    add('Aset Tetap', 'Register aset, akumulasi penyusutan, dan nilai buku');
  }
  if (include.has('bagan-akun')) {
    writeCoa(wb, ctx, b, to);
    add('Bagan Akun', 'Struktur akun, saldo normal, dan saldo akhir');
  }

  footer(cover, ctx, 'Sampul');
  writeCover(cover, ctx, from, to, toc);
  await download(wb, `${ctx.entity} - Laporan Keuangan ${periodLabel(from, to)}`);
}

