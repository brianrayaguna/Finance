import { getData } from '../store/data';
import { BACKUP_PREF_KEYS, toast, usePrefs } from '../store/ui';
import { todayISO } from '../lib/format';

export const APP_VERSION = '1.4.0';

/** Unduh seluruh buku + preferensi tampilan (tata letak dasbor, menu, mode) sebagai berkas JSON. */
export function downloadBackup() {
  const state = usePrefs.getState();
  const prefs = Object.fromEntries(BACKUP_PREF_KEYS.map((k) => [k, state[k]]));
  const payload = { app: 'keuanganku', version: 3, appVersion: APP_VERSION, exportedAt: new Date().toISOString(), data: getData(), prefs };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `keuanganku-cadangan-${todayISO()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Cadangan data diunduh', { tone: 'success', detail: a.download });
}
