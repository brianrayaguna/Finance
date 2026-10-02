/*
 * Pemeriksaan integritas buku.
 * Mesin jurnal menolak transaksi yang cacat (akun hilang, jurnal tidak seimbang) agar buku besar
 * selalu seimbang. Modul ini melaporkan transaksi yang ditolak itu beserta kejanggalan lain
 * (pembayaran yatim, pembayaran melebihi pokok, nomor bukti ganda, aset tidak valid) supaya
 * pengguna bisa memperbaikinya — tidak ada yang hilang diam-diam.
 */
import { SUBTYPE_META } from './coa';
import { buildJournal, journalizeTx, makeCtx, TX_META } from './engine';
import type { AppData, Transaction } from './types';
import { formatDate, formatMoney, isZero, round2 } from '../lib/format';

export type IssueLevel = 'error' | 'warn';

export interface IntegrityIssue {
  level: IssueLevel;
  code: string;
  message: string;
  txId?: string;
  assetId?: string;
  ref?: string;
}

const PAYMENT_TYPES = new Set(['payable_pay', 'receivable_collect', 'receivable_writeoff']);

function whyNotJournalized(t: Transaction, has: (id?: string) => boolean): string {
  if (t.type === 'journal') {
    const lines = (t.lines ?? []).filter((l) => (l.debit || 0) || (l.credit || 0));
    if (lines.some((l) => !has(l.accountId))) return 'memakai akun yang sudah tidak ada';
    const d = round2(lines.reduce((s, l) => s + Math.abs(l.debit || 0), 0));
    const c = round2(lines.reduce((s, l) => s + Math.abs(l.credit || 0), 0));
    if (!isZero(d - c)) return `tidak seimbang (debit ${formatMoney(d)} vs kredit ${formatMoney(c)})`;
    return 'kurang dari dua baris bernominal';
  }
  const refs = [t.accountId, t.toAccountId, t.categoryId].filter(Boolean) as string[];
  if (refs.some((id) => !has(id))) return 'memakai akun atau kategori yang sudah tidak ada';
  if (!(Math.abs(t.amount || 0) > 0) && !(t.fee || t.interest)) return 'nominalnya nol';
  return 'datanya tidak lengkap';
}

const cache = new WeakMap<AppData, IntegrityIssue[]>();

/** Hasil di-cache per objek data (data tidak pernah dimutasi — setiap perubahan membuat objek baru). */
export function checkIntegrity(data: AppData): IntegrityIssue[] {
  const hit = cache.get(data);
  if (hit) return hit;
  const res = computeIntegrity(data);
  cache.set(data, res);
  return res;
}

function computeIntegrity(data: AppData): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const ctx = makeCtx(data);
  const has = (id?: string) => !!id && ctx.acc.has(id);

  // 1. Transaksi yang tidak dapat dijurnal
  for (const t of data.transactions) {
    if (journalizeTx(t, ctx)) continue;
    // saldo awal bernilai nol memang sengaja tidak dijurnal
    if (t.type === 'opening' && isZero(t.amount || 0) && has(t.accountId)) continue;
    issues.push({
      level: 'error',
      code: 'not-journalized',
      txId: t.id,
      ref: t.ref,
      message: `${TX_META[t.type]?.label ?? 'Transaksi'} ${t.ref} (${formatDate(t.date)}) tidak masuk buku karena ${whyNotJournalized(t, has)}.`,
    });
  }

  // 2. Pembayaran hutang/piutang
  const paidBy = new Map<string, number>();
  for (const t of data.transactions) {
    if (!PAYMENT_TYPES.has(t.type)) continue;
    const parent = t.parentId ? ctx.txById.get(t.parentId) : undefined;
    const wantParent = t.type === 'payable_pay' ? 'payable_new' : 'receivable_new';
    if (!parent || parent.type !== wantParent) {
      issues.push({
        level: 'error',
        code: 'orphan-payment',
        txId: t.id,
        ref: t.ref,
        message: `${TX_META[t.type].label} ${t.ref} tidak terhubung ke ${t.type === 'payable_pay' ? 'hutang' : 'piutang'} yang valid.`,
      });
      continue;
    }
    if (t.date < parent.date)
      issues.push({
        level: 'warn',
        code: 'payment-before-origin',
        txId: t.id,
        ref: t.ref,
        message: `${t.ref} bertanggal ${formatDate(t.date)}, sebelum ${parent.ref} dicatat (${formatDate(parent.date)}).`,
      });
    paidBy.set(parent.id, round2((paidBy.get(parent.id) ?? 0) + (t.amount || 0)));
  }
  for (const [id, paid] of paidBy) {
    const o = ctx.txById.get(id)!;
    if (paid - o.amount > 0.005)
      issues.push({
        level: 'warn',
        code: 'overpaid',
        txId: o.id,
        ref: o.ref,
        message: `${o.type === 'payable_new' ? 'Hutang' : 'Piutang'} ${o.contact ?? ''} (${o.ref}) terbayar ${formatMoney(paid)}, melebihi pokok ${formatMoney(o.amount)}.`,
      });
  }

  // 3. Nomor bukti ganda
  const byRef = new Map<string, number>();
  for (const t of data.transactions) if (t.ref) byRef.set(t.ref, (byRef.get(t.ref) ?? 0) + 1);
  for (const [ref, n] of byRef)
    if (n > 1) issues.push({ level: 'warn', code: 'duplicate-ref', ref, message: `Nomor bukti ${ref} dipakai ${n} transaksi.` });

  // 3a. Transfer ke akun yang sama hanya membukukan biaya admin — hampir pasti salah pilih akun
  for (const t of data.transactions)
    if (t.type === 'transfer' && t.accountId && t.accountId === t.toAccountId)
      issues.push({
        level: 'warn',
        code: 'transfer-same-account',
        txId: t.id,
        ref: t.ref,
        message: `Transfer ${t.ref} (${formatDate(t.date)}) memakai akun asal dan tujuan yang sama.`,
      });

  // 3b. Kemungkinan tercatat dua kali: isian identik yang disimpan berselang kurang dari satu menit
  const recent = new Map<string, Transaction>();
  for (const t of [...data.transactions].sort((a, b) => a.createdAt - b.createdAt)) {
    if (t.type === 'opening' || t.type === 'journal') continue;
    const key = [t.type, t.date, t.time, round2(t.amount || 0), t.accountId, t.toAccountId, t.categoryId, t.parentId, (t.description ?? '').trim()].join('|');
    const prev = recent.get(key);
    if (prev && t.createdAt - prev.createdAt < 60_000)
      issues.push({
        level: 'warn',
        code: 'possible-duplicate',
        txId: t.id,
        ref: t.ref,
        message: `${t.ref} identik dengan ${prev.ref} dan disimpan hampir bersamaan — kemungkinan tercatat dua kali.`,
      });
    recent.set(key, t);
  }

  // 4. Aset tetap
  for (const a of data.assets) {
    if (!has(a.accountId))
      issues.push({ level: 'error', code: 'asset-account', assetId: a.id, ref: a.ref, message: `Aset ${a.name} memakai kelompok akun yang sudah tidak ada.` });
    if (a.funding === 'wallet' && a.paidFromAccountId && !has(a.paidFromAccountId))
      issues.push({ level: 'warn', code: 'asset-wallet', assetId: a.id, ref: a.ref, message: `Akun pembayaran aset ${a.name} sudah tidak ada — perolehan dicatat terhadap ekuitas saldo awal.` });
    if (a.depreciable !== false && a.residualValue >= a.cost)
      issues.push({ level: 'warn', code: 'asset-residual', assetId: a.id, ref: a.ref, message: `Nilai sisa aset ${a.name} tidak di bawah harga perolehan, sehingga tidak disusutkan.` });
    if (a.disposal && a.disposal.date < a.acquisitionDate)
      issues.push({ level: 'error', code: 'asset-disposal', assetId: a.id, ref: a.ref, message: `Tanggal pelepasan aset ${a.name} mendahului tanggal perolehan; pelepasan diabaikan.` });
    else if (a.disposal && !has(a.disposal.accountId))
      issues.push({ level: 'warn', code: 'asset-disposal-account', assetId: a.id, ref: a.ref, message: `Akun penerimaan pelepasan aset ${a.name} sudah tidak ada — pelepasan tidak dicatat dan aset masih disusutkan.` });
  }

  // 5. Anggaran
  for (const bg of data.budgets) {
    const acc = ctx.acc.get(bg.categoryId);
    if (!acc || acc.type !== 'expense')
      issues.push({ level: 'warn', code: 'budget-account', message: `Ada anggaran untuk kategori yang bukan/tidak lagi berupa akun beban.` });
  }

  // 6. Bagan akun
  const byCode = new Map<string, string[]>();
  for (const a of data.accounts) {
    if (!SUBTYPE_META[a.subtype]) issues.push({ level: 'error', code: 'account-subtype', message: `Akun ${a.name} memiliki jenis yang tidak dikenal.` });
    byCode.set(a.code, [...(byCode.get(a.code) ?? []), a.name]);
  }
  for (const [code, names] of byCode)
    if (names.length > 1) issues.push({ level: 'warn', code: 'duplicate-code', message: `Kode akun ${code} dipakai oleh ${names.join(', ')}.` });

  // 7. Kontrol akhir: total debit = total kredit seluruh buku
  let d = 0;
  let c = 0;
  for (const e of buildJournal(data)) for (const l of e.lines) {
    d += l.debit;
    c += l.credit;
  }
  if (!isZero(d - c))
    issues.push({ level: 'error', code: 'unbalanced-books', message: `Total debit dan kredit buku besar berselisih ${formatMoney(round2(d - c))}.` });

  return issues.sort((x, y) => (x.level === y.level ? 0 : x.level === 'error' ? -1 : 1));
}
