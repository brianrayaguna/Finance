import { getData } from '../store/data';
import { BACKUP_PREF_KEYS, usePrefs } from '../store/ui';
import { saveFile } from '../lib/saveFile';
import { todayISO } from '../lib/format';

export const APP_VERSION = '1.5.0';

/** Unduh seluruh buku + preferensi tampilan (tata letak dasbor, menu, mode) sebagai berkas JSON. */
export function downloadBackup() {
  const state = usePrefs.getState();
  const prefs = Object.fromEntries(BACKUP_PREF_KEYS.map((k) => [k, state[k]]));
  const payload = { app: 'keuanganku', version: 3, appVersion: APP_VERSION, exportedAt: new Date().toISOString(), data: getData(), prefs };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  // APK: Download/Keuanganku/Cadangan (atau folder pilihan) + toast berisi lokasi; web: unduhan peramban.
  return saveFile({ kind: 'backup', name: `keuanganku-cadangan-${todayISO()}.json`, mime: 'application/json', blob });
}
