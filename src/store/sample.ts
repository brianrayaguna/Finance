import { defaultAccounts, SYS } from '../accounting/coa';
import { nextRef, refPrefix } from '../accounting/engine';
import type { Account, AppData, Budget, FixedAsset, Goal, Transaction, TxTemplate } from '../accounting/types';
import { addDays, addMonths, endOfMonth, parseISO, startOfMonth, todayISO, round2 } from '../lib/format';

/** "HH:mm" → milidetik sejak tengah malam (bawaan 09.00). */
const timeMs = (hm?: string) => {
  const [h, m] = (hm ?? '09:00').split(':').map(Number);
  return ((h || 0) * 60 + (m || 0)) * 60_000;
};

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Data contoh realistis ±8 bulan terakhir untuk menjelajahi seluruh fitur. */
export function buildSampleData(profile: AppData['profile']): AppData {
  const r = rng(20260925);
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)];
  const between = (a: number, b: number, step = 1000) => Math.round((a + r() * (b - a)) / step) * step;
  const today = todayISO();
  const start = startOfMonth(addMonths(today, -8));

  const accounts: Account[] = defaultAccounts().map((a) => (a.id === SYS.cash ? { ...a, name: 'Kas Tunai' } : a));
  const mk = (id: string, code: string, name: string, subtype: Account['subtype'], icon: string, color: string): Account => ({
    id, code, name, subtype, icon, color, type: subtype === 'credit_card' ? 'liability' : 'asset', createdAt: 1700000001000,
  });
  const BCA = 'acc-w-bca';
  const MANDIRI = 'acc-w-mandiri';
  const GOPAY = 'acc-w-gopay';
  const RDN = 'acc-w-rdn';
  const CC = 'acc-w-cc';
  accounts.push(
    mk(BCA, '1-1200', 'Bank BCA', 'bank', 'landmark', '#3B6A96'),
    mk(MANDIRI, '1-1210', 'Bank Mandiri', 'bank', 'landmark', '#B8912A'),
    mk(GOPAY, '1-1300', 'GoPay', 'ewallet', 'smartphone', '#5F9A82'),
    mk(RDN, '1-1400', 'Reksa Dana', 'investment', 'trending-up', '#85578F'),
    mk(CC, '2-1200', 'Kartu Kredit', 'credit_card', 'credit-card', '#A8432F'),
  );

  const txs: Transaction[] = [];
  let clock = 1750000000000;
  const add = (t: Omit<Transaction, 'id' | 'ref' | 'createdAt' | 'updatedAt'>) => {
    if (t.date > today) return null;
    clock += 1000;
    // Waktu pencatatan realistis = tanggal & jam transaksi (bukan satu detik berurutan),
    // sehingga pemeriksaan "tercatat dua kali" tidak salah menandai data contoh.
    const at = parseISO(t.date).getTime() + timeMs(t.time) + (clock % 60_000);
    const tx: Transaction = {
      ...t,
      id: 'tx' + clock.toString(36),
      ref: nextRef(txs, refPrefix(t), t.date),
      createdAt: at,
      updatedAt: at,
    };
    txs.push(tx);
    return tx;
  };
  const time = () => `${String(between(7, 21, 1)).padStart(2, '0')}:${String(between(0, 59, 1)).padStart(2, '0')}`;

  // Saldo awal
  add({ type: 'opening', date: start, amount: 2_000_000, accountId: SYS.cash, description: '' });
  add({ type: 'opening', date: start, amount: 38_500_000, accountId: BCA, description: '' });
  add({ type: 'opening', date: start, amount: 12_000_000, accountId: MANDIRI, description: '' });
  add({ type: 'opening', date: start, amount: 750_000, accountId: GOPAY, description: '' });
  add({ type: 'opening', date: start, amount: 15_000_000, accountId: RDN, description: '' });
  add({ type: 'opening', date: start, amount: 1_250_000, accountId: CC, description: '' });

  const food = ['Makan siang kantor', 'Kopi pagi', 'Makan malam keluarga', 'Nasi padang', 'Bakso & es teh', 'Sarapan bubur', 'Martabak', 'Sate ayam', 'Makan siang tim', 'Kopi susu gula aren'];
  const transport = ['Ojek online', 'Bensin motor', 'Parkir', 'Tol dalam kota', 'KRL Commuter', 'Taksi bandara', 'Servis ringan'];
  const groceries = ['Belanja bulanan', 'Belanja sayur & buah', 'Kebutuhan dapur', 'Belanja mingguan'];
  const fun = ['Nonton bioskop', 'Konser akhir pekan', 'Karaoke', 'Tiket museum', 'Staycation'];
  const shop = ['Sepatu lari', 'Kemeja kerja', 'Tas ransel', 'Parfum', 'Kaos'];

  let m = start;
  let prevCC = 0;
  while (m <= today) {
    const y = m.slice(0, 4);
    const mo = m.slice(5, 7);
    const d = (day: number) => {
      const iso = `${y}-${mo}-${String(Math.min(day, Number(endOfMonth(m).slice(8)))).padStart(2, '0')}`;
      return iso;
    };
    let ccSpend = 0;

    add({ type: 'expense', date: d(1), time: '08:10', amount: 3_500_000, accountId: BCA, categoryId: 'acc-housing', description: 'Sewa apartemen' });
    add({ type: 'transfer', date: d(2), time: '09:00', amount: 1_750_000, accountId: BCA, toAccountId: GOPAY, description: 'Isi saldo GoPay' });
    add({ type: 'transfer', date: d(3), time: '12:30', amount: 750_000, fee: 6_500, accountId: MANDIRI, toAccountId: SYS.cash, description: 'Tarik tunai ATM' });
    add({ type: 'expense', date: d(5), time: '19:40', amount: between(620_000, 910_000), accountId: BCA, categoryId: 'acc-utilities', description: 'Listrik PLN & IndiHome' });
    add({ type: 'expense', date: d(10), time: '10:05', amount: 289_000, accountId: GOPAY, categoryId: 'acc-subscription', description: 'Paket data & Spotify' });
    add({ type: 'expense', date: d(15), time: '11:20', amount: 450_000, accountId: BCA, categoryId: 'acc-insurance', description: 'Premi asuransi kesehatan' });
    add({ type: 'expense', date: d(17), time: '20:15', amount: 250_000, accountId: BCA, categoryId: 'acc-charity', description: 'Donasi bulanan' });
    add({ type: 'income', date: d(25), time: '09:30', amount: 14_750_000, accountId: BCA, categoryId: 'acc-salary', description: 'Gaji bulanan' });
    add({ type: 'transfer', date: d(26), time: '10:00', amount: 1_500_000, accountId: BCA, toAccountId: RDN, description: 'Investasi rutin reksa dana' });
    if (prevCC > 0) add({ type: 'transfer', date: d(20), time: '13:00', amount: round2(prevCC), accountId: BCA, toAccountId: CC, description: 'Bayar tagihan kartu kredit' });

    if (r() > 0.35) add({ type: 'income', date: d(between(8, 22, 1)), time: time(), amount: between(1_750_000, 4_250_000, 50_000), accountId: MANDIRI, categoryId: 'acc-freelance', description: pick(['Proyek desain UI', 'Konsultasi keuangan', 'Proyek website UMKM', 'Pelatihan Excel']) });
    if (r() > 0.55) add({ type: 'income', date: d(28), time: '15:00', amount: between(120_000, 380_000, 5_000), accountId: RDN, categoryId: 'acc-investment-income', description: 'Imbal hasil reksa dana' });
    if (mo === '12' || mo === '03') add({ type: 'income', date: d(20), time: '09:00', amount: 7_500_000, accountId: BCA, categoryId: 'acc-bonus', description: mo === '12' ? 'Bonus akhir tahun' : 'Tunjangan hari raya' });

    const nFood = between(14, 20, 1);
    for (let i = 0; i < nFood; i++) {
      const w = pick([SYS.cash, GOPAY, GOPAY, CC]);
      const amt = between(22_000, 145_000, 500);
      const t = add({ type: 'expense', date: d(between(1, 28, 1)), time: time(), amount: amt, accountId: w, categoryId: 'acc-food', description: pick(food) });
      if (t && w === CC) ccSpend += amt;
    }
    for (let i = 0; i < between(8, 12, 1); i++) {
      add({ type: 'expense', date: d(between(1, 28, 1)), time: time(), amount: between(15_000, 120_000, 500), accountId: pick([GOPAY, SYS.cash]), categoryId: 'acc-transport', description: pick(transport) });
    }
    for (let i = 0; i < 3; i++) {
      const amt = between(280_000, 820_000, 1_000);
      const t = add({ type: 'expense', date: d(between(2, 27, 1)), time: time(), amount: amt, accountId: pick([CC, BCA]), categoryId: 'acc-groceries', description: pick(groceries) });
      if (t && t.accountId === CC) ccSpend += amt;
    }
    for (let i = 0; i < between(1, 3, 1); i++) {
      const amt = between(90_000, 450_000, 1_000);
      const t = add({ type: 'expense', date: d(between(5, 28, 1)), time: time(), amount: amt, accountId: CC, categoryId: 'acc-entertainment', description: pick(fun) });
      if (t) ccSpend += amt;
    }
    if (r() > 0.3) {
      const amt = between(180_000, 950_000, 1_000);
      const t = add({ type: 'expense', date: d(between(5, 28, 1)), time: time(), amount: amt, accountId: CC, categoryId: 'acc-shopping', description: pick(shop) });
      if (t) ccSpend += amt;
    }
    if (r() > 0.6) add({ type: 'expense', date: d(between(3, 26, 1)), time: time(), amount: between(85_000, 650_000, 1_000), accountId: pick([BCA, GOPAY]), categoryId: 'acc-health', description: pick(['Obat & vitamin', 'Konsultasi dokter', 'Cek laboratorium']) });
    if (r() > 0.7) add({ type: 'expense', date: d(between(3, 26, 1)), time: time(), amount: between(150_000, 600_000, 1_000), accountId: BCA, categoryId: 'acc-education', description: pick(['Kursus online', 'Buku referensi', 'Webinar sertifikasi']) });

    prevCC = ccSpend;
    m = addMonths(m, 1);
  }

  // Hutang & piutang
  const loanDate = addDays(startOfMonth(addMonths(today, -4)), 6);
  const loan = add({ type: 'payable_new', counter: 'wallet', date: loanDate, time: '14:00', amount: 6_000_000, accountId: BCA, contact: 'Andi Pratama', dueDate: addMonths(loanDate, 6), description: 'Pinjaman renovasi dapur' });
  if (loan) {
    add({ type: 'payable_pay', parentId: loan.id, date: addMonths(loanDate, 1), time: '10:00', amount: 1_000_000, accountId: BCA, description: '' });
    add({ type: 'payable_pay', parentId: loan.id, date: addMonths(loanDate, 2), time: '10:00', amount: 1_000_000, accountId: BCA, description: '' });
    add({ type: 'payable_pay', parentId: loan.id, date: addMonths(loanDate, 3), time: '10:00', amount: 1_000_000, interest: 50_000, accountId: BCA, description: '' });
  }
  const bengkel = add({ type: 'payable_new', counter: 'category', categoryId: 'acc-maintenance', date: addDays(today, -12), time: '16:30', amount: 1_150_000, contact: 'Bengkel Jaya Motor', dueDate: addDays(today, 4), description: 'Servis besar & ganti ban (bayar tempo)' });
  void bengkel;
  const lendDate = addDays(startOfMonth(addMonths(today, -5)), 11);
  const lend = add({ type: 'receivable_new', counter: 'wallet', date: lendDate, time: '19:00', amount: 2_500_000, accountId: BCA, contact: 'Rina Wulandari', dueDate: addMonths(lendDate, 3), description: 'Pinjaman biaya kuliah adik' });
  if (lend) add({ type: 'receivable_collect', parentId: lend.id, date: addMonths(lendDate, 2), time: '18:00', amount: 750_000, accountId: GOPAY, description: '' });
  add({ type: 'receivable_new', counter: 'category', categoryId: 'acc-freelance', date: addDays(today, -9), time: '11:00', amount: 4_500_000, contact: 'CV Maju Bersama', dueDate: addDays(today, 21), description: 'Proyek identitas visual (termin 2)' });
  const old = add({ type: 'receivable_new', counter: 'opening', date: start, amount: 1_000_000, contact: 'Doni Saputra', dueDate: addMonths(start, 2), description: 'Piutang lama sebelum pencatatan' });
  if (old) {
    add({ type: 'receivable_collect', parentId: old.id, date: addMonths(start, 1), time: '12:00', amount: 600_000, accountId: SYS.cash, description: '' });
    add({ type: 'receivable_writeoff', parentId: old.id, date: addMonths(start, 5), time: '12:00', amount: 400_000, description: 'Sisa piutang tidak tertagih' });
  }

  // Jurnal penyesuaian contoh
  const lastEnd = endOfMonth(addMonths(today, -1));
  add({
    type: 'journal',
    adjusting: true,
    date: lastEnd,
    amount: 185_000,
    description: 'Penyesuaian beban listrik yang masih harus dibayar',
    lines: [
      { accountId: 'acc-utilities', debit: 185_000, credit: 0 },
      { accountId: 'acc-accrued', debit: 0, credit: 185_000 },
    ],
  });

  // Aset tetap
  const assets: FixedAsset[] = [];
  const laptopDate = addDays(startOfMonth(addMonths(today, -6)), 8);
  if (laptopDate <= today)
    assets.push({
      id: 'ast-laptop', name: 'MacBook Pro 14"', accountId: 'acc-equipment', acquisitionDate: laptopDate,
      cost: 28_500_000, residualValue: 4_500_000, usefulLifeMonths: 48, method: 'straight_line',
      funding: 'wallet', paidFromAccountId: BCA, ref: nextRef([], 'AST', laptopDate), createdAt: 1750000500000,
    });
  const motorDate = addMonths(start, -26);
  assets.push({
    id: 'ast-motor', name: 'Sepeda Motor', accountId: 'acc-vehicle', acquisitionDate: motorDate,
    cost: 24_000_000, residualValue: 6_000_000, usefulLifeMonths: 60, method: 'straight_line',
    funding: 'opening', ref: nextRef([], 'AST', motorDate), createdAt: 1750000400000,
  });

  const budgets: Budget[] = [
    ['acc-food', 2_000_000], ['acc-groceries', 1_800_000], ['acc-transport', 700_000], ['acc-entertainment', 600_000],
    ['acc-shopping', 900_000], ['acc-utilities', 950_000], ['acc-subscription', 300_000], ['acc-health', 400_000],
  ].map(([c, a], i) => ({ id: 'bg' + i, categoryId: c as string, amount: a as number, createdAt: 1750000000000 + i }));

  const goals: Goal[] = [
    { id: 'goal-darurat', name: 'Dana darurat', target: 30_000_000, targetDate: endOfMonth(addMonths(today, 6)), accountIds: [MANDIRI], icon: 'shield', color: '#2E7F80', createdAt: 1750000600000 },
    { id: 'goal-liburan', name: 'Liburan akhir tahun', target: 12_000_000, targetDate: `${today.slice(0, 4)}-12-15`, accountIds: [GOPAY, 'acc-cash'], icon: 'plane', color: '#B8603C', createdAt: 1750000600001 },
  ];
  const templates: TxTemplate[] = [
    { id: 'tpl-kopi', name: 'Kopi pagi', type: 'expense', amount: 28_000, accountId: GOPAY, categoryId: 'acc-food', description: 'Kopi pagi', createdAt: 1750000700000 },
    { id: 'tpl-ojek', name: 'Ojek online', type: 'expense', amount: 25_000, accountId: GOPAY, categoryId: 'acc-transport', description: 'Ojek online', createdAt: 1750000700001 },
    { id: 'tpl-makan', name: 'Makan siang', type: 'expense', accountId: 'acc-cash', categoryId: 'acc-food', description: 'Makan siang', createdAt: 1750000700002 },
    { id: 'tpl-isi-gopay', name: 'Isi saldo GoPay', type: 'transfer', amount: 500_000, accountId: BCA, toAccountId: GOPAY, description: 'Isi saldo GoPay', createdAt: 1750000700003 },
  ];

  return {
    version: 1,
    profile: { ...profile, onboarded: true },
    accounts,
    transactions: txs,
    budgets,
    assets,
    goals,
    templates,
  };
}
