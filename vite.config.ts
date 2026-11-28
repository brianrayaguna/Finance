import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Pengganti `sw.js` untuk bundle APK. Tidak didaftarkan oleh index.html; berkas ini hanya diambil oleh
 * service worker lama yang masih terpasang dari versi APK sebelumnya saat browser memeriksa pembaruan.
 * Service worker lama menyajikan index.html dari cache sehingga kode baru tidak pernah berjalan — versi
 * pengganti ini langsung aktif, mengosongkan cache, mencabut registrasinya, lalu memuat ulang halaman.
 */
const RETIRING_SERVICE_WORKER = `self.addEventListener('install', function () {
  self.skipWaiting();
});
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) { return caches.delete(key); }));
      })
      .then(function () { return self.registration.unregister(); })
      .then(function () { return self.clients.matchAll({ type: 'window' }); })
      .then(function (clients) {
        clients.forEach(function (client) { client.navigate(client.url); });
      })
  );
});
`;

function retireServiceWorker(): Plugin {
  return {
    name: 'keuanganku:retire-service-worker',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: RETIRING_SERVICE_WORKER });
    },
  };
}

// `vite build --mode native` menghasilkan bundle untuk APK: tanpa service worker, karena aset sudah
// dikemas di dalam aplikasi dan service worker justru bisa menyajikan versi lama setelah pembaruan.
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    mode === 'native' && retireServiceWorker(),
    VitePWA({
      disable: mode === 'native',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Keuanganku',
        short_name: 'Keuanganku',
        description:
          'Keuanganku — catatan keuangan pribadi dengan pembukuan double-entry, laporan keuangan lengkap, dan ekspor Excel.',
        lang: 'id',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#F5F5F7',
        theme_color: '#F5F5F7',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-192x192-maskable.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'pwa-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // exceljs (±1 MB) hanya untuk ekspor; diambil saat dibutuhkan, bukan saat instal pertama.
        // webview-update.html hanya dipakai APK (server.errorPath di capacitor.config.ts).
        globIgnores: ['**/excel-*.js', 'webview-update.html'],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/excel-.*\.js$/,
            handler: 'CacheFirst',
            options: { cacheName: 'keuanganku-excel', expiration: { maxEntries: 2 } },
          },
        ],
      },
    }),
  ],
  server: { port: 5173, host: true },
  build: {
    // Batas bawah mengikuti fitur CSS yang dipakai (color-mix, oklch, :has, container query).
    // APK menolak WebView di bawah 111 lewat android.minWebViewVersion di capacitor.config.ts.
    target: ['es2020', 'chrome111', 'safari16.4', 'firefox113', 'edge111'],
    cssTarget: ['chrome111', 'safari16.4', 'firefox113', 'edge111'],
    chunkSizeWarningLimit: 2000,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // recharts sengaja tidak dipaksa ke chunk sendiri: chunk manual ikut menampung helper bersama
          // sehingga terunduh & di-parse saat start. Biarkan ikut chunk lazy RechartsCharts.
          // framer-motion juga tidak dipaksa: fiturnya (domMax) dimuat lazy lewat <LazyMotion>.
          if (id.includes('/react-router')) return 'vendor-router';
          if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) return 'vendor-react';
        },
      },
    },
  },
}));
