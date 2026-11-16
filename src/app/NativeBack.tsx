import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { closeTopLayer } from '../lib/layers';
import { usePrefs } from '../store/ui';

declare global {
  interface Window {
    /** Dipanggil MainActivity saat tombol back Android ditekan; true = sudah ditangani di web. */
    __nativeBack?: () => boolean;
  }
}

/**
 * Tombol back Android (APK): tutup dialog/menu yang terbuka, lalu kembali ke halaman sebelumnya,
 * lalu ke halaman awal. Hanya bila sudah di halaman awal tanpa riwayat, aplikasi diminimalkan.
 */
export function NativeBack() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const landing = usePrefs((s) => s.landing);
  useEffect(() => {
    window.__nativeBack = () => {
      if (closeTopLayer()) return true;
      const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
      if (idx > 0) {
        nav(-1);
        return true;
      }
      if (pathname !== landing) {
        nav(landing, { replace: true });
        return true;
      }
      return false;
    };
    return () => {
      delete window.__nativeBack;
    };
  }, [nav, pathname, landing]);
  return null;
}
