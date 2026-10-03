# Keuanganku — Catatan Keuangan & Akuntansi

Aplikasi web pengelola keuangan dengan **mesin akuntansi double-entry**. Setiap pemasukan, pengeluaran, transfer, hutang, dan piutang otomatis dijurnal (debit = kredit), lalu buku besar, neraca saldo, dan seluruh laporan keuangan tersusun sendiri — lengkap dengan ekspor Excel berstandar pelaporan.

Tampilan **putih galeri** dengan kartu datar berbingkai garis rambut, tinta **hijau hutan `#163300`**, dan satu warna aksi, **lime `#9FE870`**, untuk tindakan utama dan menu aktif. Tombol dan tag berbentuk pil. Antarmuka, judul, dan seluruh angka nominal memakai Inter dengan angka tabular agar kolom rupiah rata dan tegas. Tersedia tema terang, gelap (hijau-hitam), dan otomatis. Aplikasi langsung terbuka di halaman Ringkasan — tanpa layar sambutan.

---

## Fitur

**Pencatatan**
- Pemasukan, pengeluaran, pengembalian dana (refund), transfer (dengan biaya admin), hutang & piutang (baru, pembayaran, bunga/denda, hapus buku)
- Hutang/piutang dari uang tunai, dari pembelian/penjualan kredit, atau saldo lama
- Jurnal umum manual & jurnal penyesuaian (AJP) dengan pengecekan keseimbangan
- Aset tetap dengan penyusutan otomatis bulanan (garis lurus / saldo menurun ganda), opsi *tidak disusutkan* untuk tanah, dan pelepasan aset (laba/rugi otomatis)
- Anggaran bulanan per kategori dengan penanda laju waktu
- Penyesuaian saldo (rekonsiliasi) dompet

**Akuntansi & laporan**
- Jurnal umum, jurnal penutup, buku besar dengan saldo berjalan, neraca saldo
- **Kunci periode (tutup buku)**: setelah laporan final, kunci buku sampai tanggal tertentu — transaksi, saldo awal, dan aset tetap di periode itu tidak dapat ditambah, diubah, atau dihapus dari formulir mana pun
- Laporan Laba Rugi, Posisi Keuangan (Neraca), Arus Kas (metode langsung + rekonsiliasi tidak langsung), Perubahan Ekuitas
- Neraca Lajur 10 kolom, Analisis Rasio Keuangan, Umur Piutang & Hutang, Anggaran vs Realisasi
- Kolom komparatif periode sebelumnya / periode yang sama tahun lalu
- Uji keseimbangan otomatis di setiap laporan
- **Pemeriksaan integritas buku** (Pengaturan › Data): transaksi yang tidak dapat dijurnal, jurnal manual tidak seimbang, pembayaran yatim/melebihi pokok, nomor bukti atau kode akun ganda, kemungkinan catatan ganda, transfer ke akun yang sama, aset atau pelepasan aset tidak valid — lengkap dengan tombol *Perbaiki*

**Ekspor Excel**
- Paket laporan satu buku kerja: sampul, ikhtisar (rujukan antar-lembar), daftar isi berhyperlink
- Format akuntansi (negatif dalam kurung), subtotal & total memakai rumus aktif, SUBTOTAL yang mengikuti filter
- Baris kontrol berbasis rumus (Aset − Liabilitas & Ekuitas, Debit − Kredit, metode langsung − tidak langsung)
- Kop laporan, judul berulang saat dicetak, nomor halaman, panel beku, filter otomatis, A4 siap cetak

**Dasbor yang dapat disesuaikan**
- Mode *Sesuaikan*: seret widget (mouse, sentuh, atau tombol panah), ubah ukuran (kecil/sedang/lebar/penuh), atur isi, sembunyikan — baris selalu terisi rapi tanpa celah
- 19 widget: kekayaan bersih, indikator utama (4 kartu pilihan dari 10 metrik), arus kas & komposisi (satu kartu bertab), dompet-anggaran-hutang (satu kartu bertab), transaksi terbaru, kesehatan keuangan, jatuh tempo, kategori teratas, kalender pengeluaran, transaksi favorit, target tabungan, saldo kas harian, wawasan otomatis, integritas buku — plus versi terpisah untuk pendapatan & beban, komposisi, dompet, anggaran, dan hutang-piutang
- Tata letak siap pakai *Lengkap*, *Sederhana*, *Akuntan*; panduan *Mulai di sini* untuk pengguna baru
- **Target tabungan** yang kemajuannya dihitung dari saldo dompet tertaut, dengan saran setoran per bulan
- **Transaksi favorit**: simpan dari formulir, catat ulang dengan sekali klik dari tombol *Catat*, dasbor, atau palet perintah

**Pengalaman pengguna**
- Sidebar: *Cari* (⌘/Ctrl + K) dan *Catat transaksi* di atas, menu berkelompok yang dapat dilipat dengan bagian *Favorit* dan lencana (jatuh tempo, anggaran terlampaui), daftar **saldo tiap rekening**, dan profil di bawah
- Menu profil berisi Pengaturan (⌘/Ctrl + ,), Tampilan (tema terang/gelap/sistem, Mode Sederhana/Akuntan), pintasan keyboard, sembunyikan nominal, dan cadangkan data
- Bilah atas ramping: jejak halaman, urungkan/ulangi, dan lonceng pengingat; di tablet & ponsel tombol cari dan catat pindah ke bilah atas / navigasi bawah
- Menu dapat disesuaikan: sematkan ke Favorit, sembunyikan, ubah urutan; **Mode Sederhana** menyembunyikan halaman pembukuan teknis
- Preferensi awal pekan (Senin/Minggu), halaman pembuka, periode laporan bawaan, dan angka ringkas
- Bilah sisi yang dapat diciutkan (⌘/Ctrl + B), palet perintah & pencarian global (⌘/Ctrl + K)
- Urungkan / ulangi (⌘/Ctrl + Z, ⌘/Ctrl + ⇧ + Z) dan tombol *Urungkan* di setiap notifikasi
- Input nominal dengan titik ribuan otomatis, kalkulator (+ − × ÷), `k` = ribu, `j` = juta
- Navigasi formulir dengan Enter, simpan dengan ⌘/Ctrl + Enter
- Kalender bulanan (intensitas pengeluaran, jatuh tempo) dan tampilan tahunan — tab *Kalender* di halaman Transaksi
- Kategori & akun dapat ditambah, diubah, diarsipkan, dengan ikon dan warna kustom
- Tema terang/gelap/otomatis, 5 warna utama yang diturunkan dari satu rumus warna (hutan & lime bawaan), kepadatan tampilan, mode sembunyikan nominal
- Cadangkan & pulihkan data (JSON) — termasuk tata letak dasbor, menu, dan preferensi

---

## Teknologi

React 19 · TypeScript · Vite · Zustand · Framer Motion · Recharts · ExcelJS · Flaticon UIcons

Huruf **Inter** di-host sendiri (`src/assets/fonts`, lisensi SIL OFL) sehingga tidak bergantung pada Google Fonts. Ikon memakai [Flaticon UIcons](https://www.flaticon.com/uicons) (gaya Regular Rounded; Solid Rounded untuk status aktif) — kredit "Uicons by Flaticon" tampil di Pengaturan › Tentang.

Data tersimpan di peramban (localStorage) sehingga aplikasi berjalan sepenuhnya di sisi klien tanpa server atau basis data. Kunci penyimpanan lama (`neraca.*`) sengaja dipertahankan agar data yang sudah ada tetap terbaca setelah pergantian nama.

---

## Menjalankan secara lokal

Prasyarat: Node.js 20.19+ (disarankan 22).

```bash
npm install
npm run dev
```

Buka `http://localhost:5173`.

Uji otomatis (mesin akuntansi, laporan, kunci periode, integritas, input nominal):

```bash
npm test          # vitest
npm run check     # typecheck + tes
```

Build produksi:

```bash
npm run build
npm run preview
```

---

## Deploy ke Vercel

1. Unggah folder proyek ini ke repositori GitHub baru.
2. Di [vercel.com](https://vercel.com) pilih **Add New → Project**, lalu impor repositori tersebut.
3. Vercel mendeteksi Vite secara otomatis:
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Klik **Deploy**.

Berkas `vercel.json` sudah menyertakan *rewrite* agar setiap rute (mis. `/laporan`, `/buku-besar`) dapat dibuka langsung, *cache header* untuk aset statis, serta header keamanan dasar.

---

## Struktur proyek

```
src/
├─ accounting/      Mesin akuntansi: bagan akun, jurnal, laporan, periode, kunci periode, target, wawasan, integritas
├─ app/             Navigasi, tata letak dasbor (murni & teruji), daftar laporan
├─ export/          Pembuat buku kerja Excel
├─ store/           State, riwayat urungkan/ulangi, data contoh
├─ components/      Komponen UI, formulir, grafik, tata letak, widget dasbor (dashboard/), target (goals/)
├─ pages/           Halaman aplikasi
├─ hooks/, lib/     Utilitas format angka/tanggal, fokus, ikon
├─ assets/fonts/    Huruf yang di-host sendiri
└─ styles/          Token desain, huruf, ikon (uicons.css), komponen, tata letak, halaman
scripts/            uicons.mjs — menyusun styles/uicons.css dari ikon yang dipakai di lib/glyphs.tsx
```

Menambah ikon: tambahkan satu baris di `src/lib/glyphs.tsx` (cek nama dengan daftar UIcons), lalu jalankan `npm run uicons`. `npm run check` gagal bila `uicons.css` tidak sesuai.

### Pemetaan jurnal otomatis

| Transaksi | Debit | Kredit |
|---|---|---|
| Pemasukan | Kas/Bank | Pendapatan |
| Pengeluaran | Beban | Kas/Bank/Kartu Kredit |
| Transfer | Akun tujuan (+ Biaya Admin) | Akun asal |
| Hutang baru (uang diterima) | Kas/Bank | Hutang |
| Hutang baru (beli kredit) | Beban | Hutang |
| Bayar hutang | Hutang (+ Beban Bunga) | Kas/Bank |
| Piutang baru (uang dipinjamkan) | Piutang | Kas/Bank |
| Piutang baru (jual kredit) | Piutang | Pendapatan |
| Terima piutang | Kas/Bank | Piutang (+ Pendapatan Bunga) |
| Hapus buku piutang | Beban Piutang Tak Tertagih | Piutang |
| Saldo awal | Aset | Ekuitas Saldo Awal |
| Perolehan aset tetap | Aset Tetap | Kas/Bank |
| Penyusutan bulanan | Beban Penyusutan | Akumulasi Penyusutan |

### Aturan mesin akuntansi

- Jurnal manual yang **tidak seimbang** atau memakai akun yang sudah tidak ada **tidak pernah diposting**; transaksi itu dilaporkan di panel integritas, sehingga buku besar selalu seimbang.
- Pembulatan 2 desimal simetris (*half away from zero*); nilai non-numerik dianggap 0.
- Laba tahun-tahun lalu digabung ke satu akun Saldo Laba (kode terkecil) pada neraca saldo & neraca lajur.
- Jurnal penutup menutup setiap akun prive sebesar saldonya sendiri.
- Saldo menurun ganda beralih ke garis lurus saat lebih besar, sehingga aset habis tersusut tepat di nilai sisa tanpa lonjakan di bulan terakhir; nomor bukti penyusutan unik per aset.
- ROA/ROE disetahunkan untuk periode pendek; dana darurat memakai beban operasional **tunai** (tanpa penyusutan/piutang tak tertagih); tersedia rasio Cakupan Bunga (TIE).
- Data cadangan yang dipulihkan dibersihkan dahulu (jenis akun tak dikenal, nominal non-angka, tanggal tidak valid, duplikat, nomor bukti hilang).
- Semua perubahan data melewati satu pintu (*commit*) yang menolak perubahan di periode terkunci; pulihkan cadangan dan atur ulang data tetap diizinkan.
- Pelepasan aset bertanggal mendatang ikut memosting penyusutan sampai tanggal pelepasan, sehingga akumulasi penyusutan dan nilai aset habis tepat nol; pelepasan yang akun penerimaannya sudah dihapus tidak dijurnal dan dilaporkan di pemeriksaan integritas.
- Bulan berjalan dihitung sampai hari ini dan dibandingkan dengan tanggal yang sama bulan lalu; jurnal penyusutan bertanggal akhir bulan baru ikut setelah tanggalnya tiba.
- Laporan Arus Kas: saldo awal rekening yang dibukukan di tengah periode ditampilkan sebagai baris terpisah, sehingga kas awal selalu sama dengan neraca. Tarik tunai kartu kredit masuk aktivitas pendanaan; pembayaran tagihan kartu masuk operasi.
- Dasar pencatatan campuran: pemasukan dan pengeluaran harian diakui saat uang bergerak; penyusutan, piutang, dan hutang kredit diakui secara akrual; bunga pinjaman diakui saat dibayar.
- Nomor bukti permanen: tidak berganti saat tanggal dipindah dan tidak dipakai ulang setelah transaksi dihapus.
- Kunci periode juga melindungi pengelompokan akun: mengubah jenis akun yang dipakai di periode terkunci, atau awal tahun buku, ditolak.
- Nominal jurnal manual selalu diturunkan dari total debit barisnya; pembulatan dua desimal tetap tepat untuk nominal besar (mis. 10.000,005 → 10.000,01).
