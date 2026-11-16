import type { CapacitorConfig } from '@capacitor/cli';

// Aplikasi Android (APK) membungkus hasil `vite build` sehingga berjalan sepenuhnya offline.
const config: CapacitorConfig = {
  appId: 'com.keuanganku.app',
  appName: 'Keuanganku',
  webDir: 'dist',
  // Latar WebView diatur di MainActivity sesuai tema sistem (res/values{,-night}/colors.xml).
};

export default config;
