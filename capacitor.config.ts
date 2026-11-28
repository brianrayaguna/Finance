import type { CapacitorConfig } from '@capacitor/cli';

// Aplikasi Android (APK) membungkus hasil `vite build --mode native` sehingga berjalan sepenuhnya offline.
const config: CapacitorConfig = {
  appId: 'com.keuanganku.app',
  appName: 'Keuanganku',
  webDir: 'dist',
  server: {
    // Halaman yang ditampilkan bila WebView sistem terlalu lama (lihat android.minWebViewVersion)
    // atau halaman utama gagal dimuat. HTML + CSS polos agar tetap terbaca di WebView lama.
    errorPath: 'webview-update.html',
  },
  android: {
    // CSS aplikasi memakai color-mix(), oklch(), :has(), dan container query (Chromium 111+),
    // selaras dengan build.target di vite.config.ts.
    minWebViewVersion: 111,
  },
  plugins: {
    // Capacitor 8 mengelola safe-area edge-to-edge & kontras ikon status bar lewat SystemBars bawaan.
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
  },
  // Latar WebView diatur di MainActivity sesuai tema sistem (res/values{,-night}/colors.xml).
};

export default config;
