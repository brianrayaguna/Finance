# Keuanganku — panduan agen

**Browser Support:** selaras `vite` `build.target`: es2020 / chrome111 / safari16.4 / firefox113 / edge111 — batas bawah fitur CSS yang dipakai (`color-mix()`, `oklch()`, `:has()`, container query). APK menolak WebView sistem di bawah 111 (`android.minWebViewVersion` di `capacitor.config.ts`) dan menampilkan `public/webview-update.html`; halaman itu harus tetap HTML + CSS polos.

Prefer panduan `modern-web-guidance` untuk HTML/CSS/JS klien. Untuk Android APK (Capacitor WebView), utamakan mode hemat (`data-perf=lite`), hindari `backdrop-filter` di jalur gulir, dan jaga chunk berat (exceljs, recharts) tetap lazy.
