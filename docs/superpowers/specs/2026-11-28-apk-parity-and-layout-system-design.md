# Paritas APK dan sistem tata letak — desain

## Tujuan

- Pada lebar layar dan ukuran huruf yang sama, APK Android tampil dan berperilaku sama dengan versi web.
- Semua halaman memakai satu kerangka halaman, satu set kelas ukuran jendela, dan CSS yang berlapis, sehingga tata letak ponsel tersusun konsisten.
- Perbaikan performa hanya dilakukan berdasarkan hasil pengukuran di perangkat.

## Bukan tujuan

- Mengganti kerangka antarmuka atau pembungkus WebView native dengan teknologi UI lain. Mesin akuntansi tetap TypeScript. Tinjau ulang hanya jika profil di perangkat kelas bawah menunjukkan `buildJournal`/`getBooks` memakan lebih dari 16 ms per interaksi dengan data nyata.

## Paritas runtime APK

| Sumber perbedaan | Keputusan |
|---|---|
| WebView mengikuti skala huruf sistem secara otomatis | `MainActivity` menetapkan text zoom = `min(fontScale, 1,3) × 100`, sehingga skala huruf sistem tetap dihormati tetapi dibatasi 130%. |
| Fitur CSS di atas target build (`color-mix()`, `oklch()`, `:has()`, container query) | Versi minimum mesin WebView adalah 111. WebView yang lebih lama diarahkan ke halaman `webview-update.html`. Target build disamakan, dan token warna diberi nilai statis sebagai fallback. |
| Service worker PWA ikut aktif di dalam APK | Build mode `native` tidak menyertakan service worker. Saat APK dibuka, registrasi dan cache lama dicabut. |
| Inset bilah sistem | `EdgeToEdge.enable()` dipanggil di `MainActivity`. `insetsHandling: 'css'` tetap dipakai, dengan token `--safe-*` sebagai satu-satunya sumber inset. |
| Perbedaan antarperangkat sulit dilacak | Panel diagnostik di Pengaturan › Tentang (khusus APK) menampilkan versi mesin, viewport, DPR, inset, text zoom, dan mode hemat. |

## Sistem tata letak

- **Kelas ukuran jendela** dengan sumber nilai tunggal `src/app/breakpoints.ts`:
  - compact `< 600px`: navigasi bawah, satu kolom;
  - medium `600–1023px`: rail sidebar 68px;
  - expanded `≥ 1024px`: sidebar penuh.
- Media query hanya dipakai untuk kerangka aplikasi. Komponen menyesuaikan diri lewat container query.
- **Kerangka halaman `Page`** dengan slot `title`, `subtitle`, `meta`, `primaryAction`, `secondaryActions`, `toolbar`, dan `tabs`. Di compact, judul tampil di bilah atas. Baris toolbar berisi kontrol periode/filter di kiri, aksi utama berupa ikon di kanan, dan aksi lainnya di menu "⋯".
- **Token tahan pembesaran teks:** ukuran huruf memakai `rem`; kontrol, baris, dan pil memakai `min-height` + padding; spasi memakai skala `--space-*`.
- **Lapisan CSS:** `reset, tokens, base, layout, components, pages, overrides`. Gaya halaman disimpan di berkas per halaman dan diimpor oleh halaman yang di-lazy-load. Penyesuaian ponsel ditulis di samping aturan komponennya.
- **Gaya inline** hanya untuk nilai dinamis, dan itu pun lewat variabel CSS.
- **Penjaga CSS** (`scripts/css-guard.mjs`) di `npm run check` membandingkan empat jumlah dengan angka dasar `scripts/css-guard.baseline.json`: media query lebar di luar sintaks rentang 600/1024, `!important`, `height: Npx`, dan `style={{` di TSX. Jumlah yang naik menggagalkan pemeriksaan; jumlah yang turun harus dikunci dengan `npm run css-guard -- --update` agar tidak bisa naik lagi.

## Verifikasi

- Uji visual otomatis dengan matriks lebar 360/412/600/1024/1280 × tema terang/gelap × huruf 100%/130%. Pemeriksaannya: tidak ada overflow horizontal, tidak ada teks terpotong, dan bilah atas maupun bilah bawah tidak menutupi konten.
- Uji di perangkat:
  - skala huruf Normal, Besar, dan Maks;
  - navigasi gestur dan tiga tombol;
  - keyboard terbuka di formulir;
  - pembaruan APK di atas versi sebelumnya.
- Performa diukur di perangkat kelas bawah dengan target cold start < 1,5 dtk, tidak ada long task > 50 ms saat menggulir, dan dialog terbuka < 100 ms.
