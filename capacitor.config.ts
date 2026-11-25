import type { CapacitorConfig } from '@capacitor/cli';

// Aplikasi Android (APK) membungkus hasil `vite build` sehingga berjalan sepenuhnya offline.
const config: CapacitorConfig = {
  appId: 'com.keuanganku.app',
  appName: 'Keuanganku',
  webDir: 'dist',
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
