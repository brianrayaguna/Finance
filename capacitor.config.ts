import type { CapacitorConfig } from '@capacitor/cli';

// Aplikasi Android (APK) membungkus hasil `vite build` sehingga berjalan sepenuhnya offline.
const config: CapacitorConfig = {
  appId: 'com.keuanganku.app',
  appName: 'Keuanganku',
  webDir: 'dist',
  android: {
    backgroundColor: '#0B0C0A',
  },
};

export default config;
