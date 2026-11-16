package com.keuanganku.app;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Menyimpan laporan & cadangan ke lokasi yang jelas.
 * - Bawaan: Download/Keuanganku/{Laporan|Cadangan} (MediaStore di Android 10+, folder publik di Android 7–9).
 * - Folder pilihan pengguna: pemilih folder sistem (Storage Access Framework) dengan izin permanen.
 * Hanya API framework Android, tanpa dependensi tambahan.
 */
@CapacitorPlugin(
    name = "FileSaver",
    permissions = { @Permission(strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }, alias = "storage") }
)
public class FileSaverPlugin extends Plugin {

    private static final String ROOT = "Keuanganku";

    /* ───────── Pilih folder ───────── */

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION |
            Intent.FLAG_GRANT_WRITE_URI_PERMISSION |
            Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        );
        try {
            startActivityForResult(call, intent, "folderPicked");
        } catch (ActivityNotFoundException e) {
            call.reject("Pemilih folder tidak tersedia di perangkat ini", "NO_PICKER");
        }
    }

    @ActivityCallback
    private void folderPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        Uri tree = data != null ? data.getData() : null;
        if (tree == null) {
            call.reject("Dibatalkan", "CANCELLED");
            return;
        }
        try {
            getContext()
                .getContentResolver()
                .takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (SecurityException e) {
            call.reject("Izin folder ditolak", "FOLDER_ACCESS");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("uri", tree.toString());
        ret.put("label", treeLabel(tree));
        call.resolve(ret);
    }

    @PluginMethod
    public void releaseFolder(PluginCall call) {
        String uri = call.getString("uri");
        if (uri != null) {
            try {
                getContext()
                    .getContentResolver()
                    .releasePersistableUriPermission(
                        Uri.parse(uri),
                        Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                    );
            } catch (Exception ignored) {
                /* izin sudah tidak ada */
            }
        }
        call.resolve();
    }

    /* ───────── Simpan ───────── */

    @PluginMethod
    public void save(PluginCall call) {
        if (call.getString("name") == null || call.getString("data") == null) {
            call.reject("Nama atau isi berkas kosong", "BAD_ARGS");
            return;
        }
        String folder = call.getString("folderUri");
        boolean legacy = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q;
        if ((folder == null || folder.isEmpty()) && legacy && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storageGranted");
            return;
        }
        doSave(call);
    }

    @PermissionCallback
    private void storageGranted(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) doSave(call);
        else call.reject("Izin penyimpanan ditolak", "PERMISSION_DENIED");
    }

    private void doSave(PluginCall call) {
        String name = sanitize(call.getString("name"));
        String mime = call.getString("mime", "application/octet-stream");
        String sub = sanitize(call.getString("subdir", "Laporan"));
        String folder = call.getString("folderUri");
        byte[] bytes;
        try {
            bytes = Base64.decode(call.getString("data"), Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("Isi berkas rusak", "BAD_ARGS");
            return;
        }
        try {
            JSObject ret;
            if (folder != null && !folder.isEmpty()) ret = saveToTree(Uri.parse(folder), call.getString("folderLabel"), name, mime, bytes);
            else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ret = saveToDownloads(sub, name, mime, bytes);
            else ret = saveToLegacyDownloads(sub, name, mime, bytes);
            call.resolve(ret);
        } catch (SecurityException e) {
            call.reject("Folder tidak dapat diakses lagi. Pilih ulang folder di Pengaturan.", "FOLDER_ACCESS");
        } catch (Exception e) {
            call.reject("Gagal menyimpan berkas: " + e.getMessage(), "WRITE_FAILED");
        }
    }

    private JSObject saveToTree(Uri tree, String label, String name, String mime, byte[] bytes) throws Exception {
        ContentResolver cr = getContext().getContentResolver();
        Uri parent = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        Uri file = DocumentsContract.createDocument(cr, parent, mime, name);
        if (file == null) throw new Exception("folder menolak berkas baru");
        write(cr, file, bytes);
        String base = label != null && !label.isEmpty() ? label : treeLabel(tree);
        return result(file, base + "/" + displayName(file, name));
    }

    private JSObject saveToDownloads(String sub, String name, String mime, byte[] bytes) throws Exception {
        ContentResolver cr = getContext().getContentResolver();
        String rel = Environment.DIRECTORY_DOWNLOADS + "/" + ROOT + "/" + sub;
        ContentValues v = new ContentValues();
        v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        v.put(MediaStore.MediaColumns.RELATIVE_PATH, rel);
        v.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri file = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
        if (file == null) throw new Exception("MediaStore menolak berkas baru");
        try {
            write(cr, file, bytes);
        } catch (Exception e) {
            cr.delete(file, null, null);
            throw e;
        }
        ContentValues done = new ContentValues();
        done.put(MediaStore.MediaColumns.IS_PENDING, 0);
        cr.update(file, done, null, null);
        return result(file, rel + "/" + displayName(file, name));
    }

    private JSObject saveToLegacyDownloads(String sub, String name, String mime, byte[] bytes) throws Exception {
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), ROOT + "/" + sub);
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("tidak dapat membuat folder " + dir.getPath());
        File f = unique(dir, name);
        try (OutputStream out = new FileOutputStream(f)) {
            out.write(bytes);
        }
        MediaScannerConnection.scanFile(getContext(), new String[] { f.getAbsolutePath() }, new String[] { mime }, null);
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
        return result(uri, Environment.DIRECTORY_DOWNLOADS + "/" + ROOT + "/" + sub + "/" + f.getName());
    }

    /* ───────── Buka ───────── */

    @PluginMethod
    public void open(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null) {
            call.reject("Berkas tidak diketahui", "BAD_ARGS");
            return;
        }
        Intent view = new Intent(Intent.ACTION_VIEW);
        view.setDataAndType(Uri.parse(uri), call.getString("mime", "*/*"));
        view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getActivity().startActivity(Intent.createChooser(view, "Buka dengan").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("Tidak ada aplikasi untuk membuka berkas ini", "NO_APP");
        }
    }

    /* ───────── Bantuan ───────── */

    private static void write(ContentResolver cr, Uri file, byte[] bytes) throws Exception {
        try (OutputStream out = cr.openOutputStream(file, "w")) {
            if (out == null) throw new Exception("tidak dapat membuka berkas untuk ditulis");
            out.write(bytes);
        }
    }

    private static JSObject result(Uri uri, String path) {
        JSObject ret = new JSObject();
        ret.put("uri", uri.toString());
        ret.put("path", path);
        return ret;
    }

    /** Nama sebenarnya (sistem bisa menambah " (1)" bila nama sudah dipakai). */
    private String displayName(Uri uri, String fallback) {
        try (Cursor c = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String n = c.getString(0);
                if (n != null && !n.isEmpty()) return n;
            }
        } catch (Exception ignored) {
            /* pakai nama yang diminta */
        }
        return fallback;
    }

    /** "primary:Documents/Keuangan" → "Documents/Keuangan"; kartu SD → "Kartu SD/…". */
    private static String treeLabel(Uri tree) {
        String id;
        try {
            id = DocumentsContract.getTreeDocumentId(tree);
        } catch (Exception e) {
            return "Folder pilihan";
        }
        int colon = id.indexOf(':');
        String vol = colon >= 0 ? id.substring(0, colon) : "";
        String path = colon >= 0 ? id.substring(colon + 1) : id;
        if ("primary".equalsIgnoreCase(vol)) return path.isEmpty() ? "Penyimpanan internal" : path;
        if ("downloads".equalsIgnoreCase(vol) || id.startsWith("raw:")) return "Download";
        return path.isEmpty() ? "Kartu SD" : "Kartu SD/" + path;
    }

    private static File unique(File dir, String name) {
        File f = new File(dir, name);
        if (!f.exists()) return f;
        int dot = name.lastIndexOf('.');
        String stem = dot > 0 ? name.substring(0, dot) : name;
        String ext = dot > 0 ? name.substring(dot) : "";
        for (int i = 1; ; i++) {
            f = new File(dir, stem + " (" + i + ")" + ext);
            if (!f.exists()) return f;
        }
    }

    private static String sanitize(String s) {
        String t = s == null ? "" : s.replaceAll("[\\\\/:*?\"<>|]", "-").trim();
        return t.isEmpty() ? "berkas" : t;
    }
}
