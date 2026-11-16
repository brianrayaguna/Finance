import { Capacitor, registerPlugin } from '@capacitor/core';
import { toast, usePrefs, type SaveFolder, type SaveKind } from '../store/ui';

/** Plugin Android lokal: android/app/src/main/java/com/keuanganku/app/FileSaverPlugin.java */
interface FileSaverPlugin {
  pickFolder(): Promise<SaveFolder>;
  releaseFolder(o: { uri: string }): Promise<void>;
  save(o: { name: string; mime: string; data: string; subdir: string; folderUri?: string; folderLabel?: string }): Promise<{ uri: string; path: string }>;
  open(o: { uri: string; mime: string }): Promise<void>;
}

const FileSaver = registerPlugin<FileSaverPlugin>('FileSaver');

/** Berjalan sebagai APK (Capacitor) — berkas disimpan lewat plugin, bukan unduhan peramban. */
export const isNativeApp = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('FileSaver');

const SUBDIR: Record<SaveKind, string> = { report: 'Laporan', backup: 'Cadangan' };
const NOUN: Record<SaveKind, string> = { report: 'Laporan', backup: 'Cadangan data' };

/** Lokasi bawaan di APK, untuk ditampilkan di Pengaturan. */
export const defaultFolderLabel = (kind: SaveKind) => `Download/Keuanganku/${SUBDIR[kind]}`;

const errCode = (e: unknown) => (e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : '');
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function browserDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const cleanFileName = (s: string) => s.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();

/**
 * Satu pintu untuk menyimpan laporan & cadangan.
 * APK: ke folder pilihan pengguna, atau Download/Keuanganku/{Laporan|Cadangan}; toast menyebut lokasinya + tombol Buka.
 * Peramban: unduhan biasa ke folder unduhan peramban.
 * Mengembalikan lokasi yang dapat dibaca, atau null bila gagal (pesan galat sudah ditampilkan).
 */
export async function saveFile({ kind, name, mime, blob, quiet }: { kind: SaveKind; name: string; mime: string; blob: Blob; quiet?: boolean }): Promise<string | null> {
  const fileName = cleanFileName(name);
  if (!isNativeApp()) {
    browserDownload(blob, fileName);
    if (!quiet) toast(`${NOUN[kind]} diunduh`, { tone: 'success', detail: `${fileName}, di folder unduhan peramban` });
    return fileName;
  }

  const folder = usePrefs.getState().saveFolders[kind];
  const data = await toBase64(blob);
  const attempt = (f?: SaveFolder) => FileSaver.save({ name: fileName, mime, data, subdir: SUBDIR[kind], folderUri: f?.uri, folderLabel: f?.label });
  try {
    let res: { uri: string; path: string };
    try {
      res = await attempt(folder);
    } catch (e) {
      // Izin folder pilihan hilang (folder dihapus/dipindah): simpan ke lokasi bawaan dan beri tahu.
      if (folder && errCode(e) === 'FOLDER_ACCESS') {
        usePrefs.getState().set({ saveFolders: { ...usePrefs.getState().saveFolders, [kind]: undefined } });
        toast(`Folder "${folder.label}" tidak dapat diakses lagi`, { tone: 'danger', detail: 'Berkas disimpan ke lokasi bawaan. Pilih ulang folder di Pengaturan › Data & cadangan.' });
        res = await attempt(undefined);
      } else throw e;
    }
    if (!quiet)
      toast(`${NOUN[kind]} disimpan`, {
        tone: 'success',
        detail: res.path,
        action: {
          label: 'Buka',
          run: () => {
            FileSaver.open({ uri: res.uri, mime }).catch((e) => toast('Berkas tidak dapat dibuka', { tone: 'danger', detail: errMsg(e) }));
          },
        },
      });
    return res.path;
  } catch (e) {
    toast(`${NOUN[kind]} gagal disimpan`, { tone: 'danger', detail: errMsg(e) });
    return null;
  }
}

/** Pilih folder simpan (APK). Mengembalikan folder baru, atau null bila dibatalkan. */
export async function chooseSaveFolder(kind: SaveKind): Promise<SaveFolder | null> {
  if (!isNativeApp()) return null;
  try {
    const f = await FileSaver.pickFolder();
    const prev = usePrefs.getState().saveFolders[kind];
    const others = Object.entries(usePrefs.getState().saveFolders).filter(([k]) => k !== kind).map(([, v]) => v?.uri);
    if (prev && prev.uri !== f.uri && !others.includes(prev.uri)) FileSaver.releaseFolder({ uri: prev.uri }).catch(() => {});
    usePrefs.getState().set({ saveFolders: { ...usePrefs.getState().saveFolders, [kind]: f } });
    toast(`${NOUN[kind]} akan disimpan ke "${f.label}"`, { tone: 'success' });
    return f;
  } catch (e) {
    if (errCode(e) !== 'CANCELLED') toast('Folder tidak dapat dipilih', { tone: 'danger', detail: errMsg(e) });
    return null;
  }
}

/** Kembali ke lokasi bawaan Download/Keuanganku/…. */
export function resetSaveFolder(kind: SaveKind) {
  const folders = usePrefs.getState().saveFolders;
  const prev = folders[kind];
  const stillUsed = Object.entries(folders).some(([k, v]) => k !== kind && v?.uri === prev?.uri);
  if (prev && !stillUsed && isNativeApp()) FileSaver.releaseFolder({ uri: prev.uri }).catch(() => {});
  usePrefs.getState().set({ saveFolders: { ...folders, [kind]: undefined } });
}
