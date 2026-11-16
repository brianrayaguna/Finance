import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
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
        globIgnores: ['**/excel-*.js'],
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
    target: ['es2020', 'chrome100', 'safari15', 'firefox100', 'edge100'],
    cssTarget: ['chrome100', 'safari15', 'firefox100', 'edge100'],
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
});
