# Perencanaan anggaran per bulan — desain

## Tujuan

Pengguna dapat menyiapkan anggaran untuk bulan mendatang dan memilih cakupan perubahan saat menyimpan:

- **Hanya bulan itu**: anggaran khusus satu bulan, misalnya bulan dengan pengeluaran musiman.
- **Mulai bulan itu dan seterusnya**: versi baru anggaran rutin.

Bulan yang sudah lewat tidak ikut berubah, sehingga Anggaran vs Realisasi periode lampau tetap sesuai dengan anggaran yang berlaku saat itu.

## Bukan tujuan

- Anggaran mingguan atau tahunan.
- Pengalihan sisa anggaran ke bulan berikutnya (rollover).
- Perencanaan lebih jauh dari 12 bulan ke depan.

## Model data

`Budget` (`src/accounting/types.ts`) mendapat dua field opsional yang saling eksklusif:

| Field | Arti |
|---|---|
| tanpa `from` & `month` | Anggaran rutin yang berlaku sejak awal. Bentuk ini dipakai data lama, sehingga tetap kompatibel. |
| `from: 'YYYY-MM'` | Versi anggaran rutin yang berlaku mulai bulan tersebut. |
| `month: 'YYYY-MM'` | Anggaran khusus untuk satu bulan. |

`amount: 0` hanya sah bila `from` atau `month` terisi, dan berarti "tidak dianggarkan" mulai bulan itu atau pada bulan itu.

## Aturan nominal

Untuk target `T` (kunci `budgetTargetKey`) pada bulan `M`, nominal ditentukan berurutan:

1. anggaran khusus dengan `month === M`;
2. jika tidak ada, versi rutin dengan `from` terbesar yang ≤ `M` (versi tanpa `from` dianggap paling awal);
3. jika tidak ada, target tidak dianggarkan di bulan `M`.

Anggaran untuk rentang beberapa bulan adalah jumlah nominal tiap bulan dikali porsi hari bulan itu yang masuk rentang. Porsi hari ini sama dengan yang dipakai `prorateMonths()`. Rentang efektif anggaran per hutang (sejak bulan hutang dicatat sampai bulan pelunasan) tetap berlaku.

## Operasi

`upsertBudget(target, amount, { month, scope })`:

- `only`: simpan atau ganti anggaran khusus bulan `month`.
- `onward`: simpan versi rutin `from = month`, lalu hapus versi rutin yang lebih baru. Anggaran khusus tetap dipertahankan.
- tanpa opsi: ganti seluruh catatan target dengan satu anggaran rutin yang berlaku sejak awal. Ini perilaku lama.

`deleteBudget(target, { month, scope })`:

- `only`: anggaran khusus bulan `month` bernilai 0.
- `onward`: versi rutin `from = month` bernilai 0, lalu hapus versi rutin dan anggaran khusus setelah `month`.
- tanpa opsi: hapus seluruh catatan target.

Normalisasi data membuang duplikat per kombinasi target dan bulan/`from`, serta memvalidasi format `YYYY-MM`.

## Antarmuka

- Pemilih bulan di halaman Anggaran dapat maju sampai 12 bulan ke depan. Halaman lain tetap dibatasi sampai bulan berjalan.
- Di bulan berjalan tersedia aksi "Rencanakan bulan depan".
- Untuk bulan mendatang, ringkasan menampilkan total anggaran dengan status "Belum berjalan", tanpa sisa per hari dan tanpa penanda laju waktu.
- Kartu anggaran khusus diberi tanda "Khusus {bulan}". Kartu anggaran rutin tidak diberi tanda agar tampilan tetap ringkas. Di bulan mendatang, setiap kartu berstatus "Direncanakan".
- Formulir anggaran dan konfirmasi hapus memiliki pilihan cakupan "Hanya {bulan}" atau "Mulai {bulan} dan seterusnya". Bawaannya "Hanya" bila yang diubah anggaran khusus, dan "Mulai … dan seterusnya" bila tidak.

## Dampak ke modul lain

Laporan Anggaran vs Realisasi, ekspor buku kerja, widget dasbor, wawasan, dan pengingat semuanya membaca `budgetVsActual()`, sehingga otomatis memakai aturan nominal per bulan tanpa perubahan tambahan.
