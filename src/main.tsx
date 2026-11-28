import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App';
import './styles/fonts.css';
import './styles/uicons.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/widgets.css';
import './styles/layout.css';
import './styles/pages.css';
import './styles/dashboard.css';

/**
 * APK memuat aset langsung dari paket aplikasi, jadi service worker tidak dibutuhkan. Instalasi lama
 * yang sempat mendaftarkannya bisa terus menyajikan aset versi sebelumnya setelah pembaruan APK;
 * cabut registrasinya dan kosongkan cache-nya. Data pengguna ada di localStorage, tidak tersentuh.
 */
function removeServiceWorkers(): void {
  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => {});
  }
  if ('caches' in window) {
    void caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .catch(() => {});
  }
}

if (Capacitor.isNativePlatform()) removeServiceWorkers();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
