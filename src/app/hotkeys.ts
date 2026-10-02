import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ALL_NAV } from './nav';
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

      if (mod && k === 'k') {
        e.preventDefault();
        ui.setPalette(!ui.palette);
        return;
      }
      if (mod && (k === 'b' || k === '\\') && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (window.matchMedia('(max-width: 960px)').matches) ui.setMobileNav(!ui.mobileNav);
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
      if (typing || layerCount() > 0) return;

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
      if (k === 'n') {
        e.preventDefault();
        ui.openTx();
      } else if (k === 'h') {
        e.preventDefault();
        prefs.set({ hideAmounts: !prefs.hideAmounts });
      } else if (e.key === '?') {
        e.preventDefault();
        ui.setShortcuts(true);
      } else if (e.key === '/') {
        e.preventDefault();
        ui.setPalette(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav]);
}
