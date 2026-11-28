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
- 20 widget: kekayaan bersih, indikator utama (4 kartu pilihan dari 10 metrik), arus kas & komposisi (satu kartu bertab), dompet-anggaran-hutang (satu kartu bertab), transaksi terbaru, kesehatan keuangan, jatuh tempo, kategori teratas, kalender pengeluaran, transaksi favorit, target tabungan, saldo kas harian, wawasan otomatis, integritas buku, persediaan — plus versi terpisah untuk pendapatan & beban, komposisi, dompet, anggaran, dan hutang-piutang
- **Persediaan**: katalog barang (kategori, merk, barcode, harga beli/jual, reorder), mutasi masuk/keluar/opname/transfer, multi-lokasi, PO multi-baris, penjualan terikat stok (HPP otomatis, rata-rata tertimbang), alert stok rendah. Belum: multi-varian, konversi multi-satuan, PPN/HSN, foto, impor CSV
- **Navigasi ponsel**: tab bawah 4 slot dapat diganti (mis. Transaksi → Persediaan); modul Persediaan/Aset/Anggaran/Hutang/Pembukuan teknis dapat dimatikan di Pengaturan → Menu
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

Build web menghasilkan PWA lengkap dengan service worker untuk penggunaan luring di peramban.

---

## Build APK

Prasyarat: JDK 21 dan Android SDK (platform 36). Arahkan Gradle ke SDK lewat variabel `ANDROID_HOME` atau `sdk.dir` di `android/local.properties`.

```bash
npm run android:build
```

Skrip ini menjalankan berurutan:

1. `npm run check` — pemeriksaan ikon, typecheck, dan tes.
2. `vite build --mode native` — bundle web untuk APK **tanpa service worker**, karena aset sudah dikemas di dalam APK. `index.html` tidak mendaftarkan service worker apa pun; satu-satunya `sw.js` di bundle ini adalah pengganti yang mengosongkan cache lalu mencabut service worker peninggalan versi APK sebelumnya.
3. `npx cap sync android` — menyalin `dist/` dan `capacitor.config.ts` ke proyek `android/`.
4. `./gradlew assembleRelease` — APK rilis di `android/app/build/outputs/apk/release/`.

Proyek belum menyertakan konfigurasi penandatanganan, sehingga hasilnya `app-release-unsigned.apk`. Tanda tangani dengan keystore rilis (`zipalign` lalu `apksigner` dari build-tools Android SDK) sebelum dipasang. Untuk uji cepat di HP, `cd android && ./gradlew assembleDebug` menghasilkan APK debug yang langsung bisa dipasang.

Setiap rilis, naikkan `versionCode` (harus selalu lebih besar) dan `versionName` di `android/app/build.gradle`, serta `version` di `package.json` dan `APP_VERSION` di `src/app/backup.ts`.

Perilaku APK yang berbeda dari versi web:

- **Ukuran huruf** mengikuti pengaturan HP, dibatasi maksimal 130% (`MainActivity.java`). Mengubah ukuran huruf sistem membuat ulang activity sehingga batas ini dihitung ulang.
- **Edge-to-edge**: konten digambar di bawah status bar dan bilah navigasi; CSS membaca area aman lewat `--safe-top`, `--safe-right`, `--safe-bottom`, dan `--safe-left` di `src/styles/tokens.css`.
- **WebView minimum 111** (`android.minWebViewVersion`, selaras `build.target`). Di bawah versi itu, atau bila halaman utama gagal dimuat, APK menampilkan `public/webview-update.html` yang meminta pengguna memperbarui WebView Sistem Android.
- **Diagnostik** di Pengaturan › Tentang (hanya di APK): versi WebView, ukuran jendela dan viewport visual, rasio piksel, area aman, zoom teks efektif, dan status mode hemat, dengan tombol *Salin* untuk dilampirkan pada laporan masalah tampilan.

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
- Saldo menurun ganda memakai tarif **tahunan** 2 ÷ umur (tahun) atas nilai buku awal tiap tahun manfaat, dibagi 12 per bulan (umur 4 tahun: 50% di tahun pertama); beralih ke garis lurus saat lebih besar dan berhenti tepat di nilai sisa; nomor bukti penyusutan unik per aset.
- ROA/ROE disetahunkan untuk periode pendek; dana darurat memakai beban operasional **tunai** (tanpa penyusutan/piutang tak tertagih); Cakupan Bunga (TIE) = EBIT (laba bersih + bunga + pajak) ÷ beban bunga.
- DSR = pokok + bunga yang dibayar dari kas ÷ pendapatan, dihitung dari jurnal: pembayaran hutang, cicilan pinjaman jangka pendek maupun panjang (mis. KPR), bunga yang dicatat sebagai pengeluaran, dan jurnal manual. Pelunasan tagihan kartu kredit tidak termasuk.
- Jurnal penutup dibuat otomatis (virtual) oleh laporan. Akun Ikhtisar Laba Rugi tidak ditawarkan di jurnal manual, dan jurnal manual yang memindahkan pendapatan/beban ke Ikhtisar L/R atau Saldo Laba ditandai di pemeriksaan integritas.
- Data cadangan yang dipulihkan dibersihkan dahulu (jenis akun tak dikenal, nominal non-angka, tanggal tidak valid, duplikat, nomor bukti hilang).
- Semua perubahan data melewati satu pintu (*commit*) yang menolak perubahan di periode terkunci; pulihkan cadangan dan atur ulang data tetap diizinkan.
- Pelepasan aset bertanggal mendatang ikut memosting penyusutan sampai tanggal pelepasan, sehingga akumulasi penyusutan dan nilai aset habis tepat nol; pelepasan yang akun penerimaannya sudah dihapus tidak dijurnal dan dilaporkan di pemeriksaan integritas.
- Bulan berjalan dihitung sampai hari ini dan dibandingkan dengan tanggal yang sama bulan lalu; jurnal penyusutan bertanggal akhir bulan baru ikut setelah tanggalnya tiba.
- Laporan Arus Kas: saldo awal rekening yang dibukukan di tengah periode ditampilkan sebagai baris terpisah, sehingga kas awal selalu sama dengan neraca. Tarik tunai kartu kredit masuk aktivitas pendanaan; pembayaran tagihan kartu masuk operasi.
- Dasar pencatatan campuran: pemasukan dan pengeluaran harian diakui saat uang bergerak; penyusutan, piutang, dan hutang kredit diakui secara akrual; bunga pinjaman diakui saat dibayar.
- Nomor bukti permanen: tidak berganti saat tanggal dipindah dan tidak dipakai ulang setelah transaksi dihapus.
- Kunci periode juga melindungi pengelompokan akun: mengubah jenis akun yang dipakai di periode terkunci, atau awal tahun buku, ditolak.
- Nominal jurnal manual selalu diturunkan dari total debit barisnya; pembulatan dua desimal tetap tepat untuk nominal besar (mis. 10.000,005 → 10.000,01).
