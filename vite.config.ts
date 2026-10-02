import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  build: {
    target: ['es2020', 'chrome100', 'safari15', 'firefox100', 'edge100'],
    cssTarget: ['chrome100', 'safari15', 'firefox100', 'edge100'],
    chunkSizeWarningLimit: 2000,
    sourcemap: false,
  },
});
