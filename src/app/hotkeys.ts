import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ALL_NAV } from './nav';
import { currentWindowClass } from './breakpoints';
import { isTypingTarget, layerCount } from '../lib/layers';
import { usePrefs, useUI } from '../store/ui';
import { undo, redo } from '../store/history';

export function useGlobalHotkeys() {
  const nav = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const typing = isTypingTarget(e.target);
      const k = e.key.toLowerCase();
      const ui = useUI.getState();
      const prefs = usePrefs.getState();

      if (e.isComposing || e.keyCode === 229) return;
      if (mod && k === 'k') {
        if (layerCount() > 0 && !ui.palette) return;
        e.preventDefault();
        ui.setPalette(!ui.palette);
        return;
      }
      if (layerCount() > 0) return;
      if (mod && (k === 'b' || k === '\\') && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (currentWindowClass() !== 'expanded') ui.setMobileNav(!ui.mobileNav);
        else prefs.set({ sidebarCollapsed: !prefs.sidebarCollapsed });
        return;
      }
      // ⌘, / Ctrl , — konvensi aplikasi desktop untuk membuka pengaturan
      if (mod && k === ',' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        ui.setMobileNav(false);
        nav('/pengaturan');
        return;
      }
      if (typing) return;

      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && k === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (e.altKey && !mod && /^Digit\d$/.test(e.code)) {
        const d = e.code.slice(5);
        const item = ALL_NAV.find((n) => n.hotkey === d);
        if (item) {
          e.preventDefault();
          nav(item.to);
        }
        return;
      }
      if (mod || e.altKey) return;
      if (k === 'n' && !e.shiftKey) {
        e.preventDefault();
        ui.openTx();
      } else if (k === 'h' && !e.shiftKey) {
        e.preventDefault();
        prefs.set({ hideAmounts: !prefs.hideAmounts });
      } else if (e.key === '?') {
        e.preventDefault();
        ui.setShortcuts(true);
      } else if (e.key === '/' && !e.shiftKey) {
        // Di halaman daftar Transaksi, '/' memfokuskan kolom pencarian halaman alih-alih membuka palet perintah bersamaan.
        const onTxList =
          window.location.pathname === '/transaksi' &&
          new URLSearchParams(window.location.search).get('tampil') !== 'kalender';
        if (onTxList) return;
        e.preventDefault();
        ui.setPalette(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav]);
}
