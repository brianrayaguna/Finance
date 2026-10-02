import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, Plus, Rocket, Sparkles, X } from 'lucide-react';
import { replaceData, useData } from '../../store/data';
import { buildSampleData } from '../../store/sample';
import { notify } from '../../store/history';
import { confirm, usePrefs, useUI } from '../../store/ui';
import { Button, Progress } from '../ui/primitives';

/**
 * Kartu "Mulai di sini" untuk pengguna baru: langkah-langkah awal yang tercentang otomatis
 * sesuai data. Hilang sendiri setelah semua selesai, atau bisa ditutup.
 *
 * `first` = belum ada transaksi sama sekali: kartu tampil sebagai sambutan dengan dua aksi jelas
 * (catat transaksi pertama / lihat dengan data contoh), dan dasbor menyembunyikan widget yang masih kosong.
 */
export function Onboarding({ onGoal, first = false }: { onGoal: () => void; first?: boolean }) {
  const dismissed = usePrefs((s) => s.onboardingDismissed);
  const setPrefs = usePrefs((s) => s.set);
  const openTx = useUI((s) => s.openTx);
  const nav = useNavigate();
  const data = useData((s) => s.data);
  if (dismissed) return null;

  // Satu klik: buku kosong tidak perlu konfirmasi (tidak ada yang tertimpa); tetap bisa diurungkan dari toast.
  const loadSample = async () => {
    if (data.transactions.length > 0) {
      const ok = await confirm({
        title: 'Muat data contoh?',
        message: 'Data saat ini akan diganti dengan delapan bulan transaksi contoh. Tindakan ini dapat diurungkan.',
        confirmLabel: 'Muat contoh',
      });
      if (!ok) return;
    }
    notify('Data contoh dimuat', replaceData(buildSampleData({ ...data.profile, onboarded: true }), 'Muat data contoh'));
  };

  const steps = [
    {
      done: data.transactions.some((t) => t.type === 'opening'),
      title: 'Isi saldo awal dompet',
      text: 'Saldo kas, rekening bank, dan e-wallet saat ini.',
      run: () => nav('/dompet'),
    },
    {
      done: data.transactions.some((t) => t.type === 'income' || t.type === 'expense'),
      title: 'Catat transaksi pertama',
      text: 'Jurnal dan laporan tersusun otomatis.',
      run: () => openTx(),
    },
    {
      done: data.budgets.length > 0,
      title: 'Tetapkan anggaran bulanan',
      text: 'Batasi beban per kategori.',
      run: () => nav('/anggaran'),
    },
    {
      done: data.goals.length > 0,
      title: 'Buat target tabungan',
      text: 'Dana darurat, liburan, atau DP rumah.',
      run: onGoal,
    },
    {
      done: data.templates.length > 0,
      title: 'Simpan transaksi favorit',
      text: 'Transaksi rutin cukup sekali klik.',
      run: () => openTx(),
    },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;

  const close = (
    <button type="button" className="close-btn" onClick={() => setPrefs({ onboardingDismissed: true })} aria-label="Tutup panduan awal">
      <X />
    </button>
  );

  const list = (
    <ol className="onb-steps">
      {steps.map((s, i) => (
        <li key={s.title}>
          <button type="button" className={`onb-step${s.done ? ' done' : ''}`} onClick={s.run} aria-label={`${s.title}${s.done ? ' — selesai' : ''}`}>
            <span className="onb-num" aria-hidden>
              {s.done ? <Check /> : i + 1}
            </span>
            <span className="grow">
              <strong>{s.title}</strong>
              <span>{s.text}</span>
            </span>
            {!s.done && <ChevronRight className="onb-chev" aria-hidden />}
          </button>
        </li>
      ))}
    </ol>
  );

  if (first) {
    return (
      <section className="card onboard onboard-first" aria-labelledby="onb-title">
        <div className="onb-welcome">
          <span className="onb-ico lg" aria-hidden>
            <Rocket />
          </span>
          <div className="grow">
            <h2 id="onb-title" className="onb-welcome-title">
              Selamat datang di Keuanganku
            </h2>
            <p className="onb-welcome-text">Catat pemasukan dan pengeluaran — jurnal, buku besar, dan laporan tersusun otomatis.</p>
            <div className="onb-cta">
              <Button variant="primary" icon={Plus} onClick={() => openTx()}>
                Catat transaksi pertama
              </Button>
              <Button icon={Sparkles} onClick={loadSample}>
                Lihat dengan data contoh
              </Button>
            </div>
          </div>
          {close}
        </div>
        <div className="onb-sub-head">
          <span>Langkah awal · {done} dari {steps.length} selesai</span>
          <div className="onb-progress">
            <Progress value={done / steps.length} thin label="Kemajuan langkah awal" />
          </div>
        </div>
        {list}
        <p className="onb-foot">Ringkasan, grafik, dan widget lain akan muncul di sini setelah transaksi pertama tercatat.</p>
      </section>
    );
  }

  return (
    <section className="card onboard" aria-labelledby="onb-title">
      <div className="onb-head">
        <span className="onb-ico" aria-hidden>
          <Rocket />
        </span>
        <div className="grow">
          <h2 id="onb-title" className="card-title">
            Mulai di sini
          </h2>
          <div className="card-sub">{done} dari {steps.length} langkah selesai</div>
        </div>
        <Button size="sm" icon={Sparkles} onClick={loadSample}>
          Coba data contoh
        </Button>
        <div className="onb-progress">
          <Progress value={done / steps.length} thin label="Kemajuan langkah awal" />
        </div>
        {close}
      </div>
      {list}
    </section>
  );
}
