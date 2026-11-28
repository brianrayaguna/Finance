package com.keuanganku.app;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.activity.OnBackPressedCallback;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** Batas atas skala huruf sistem yang diteruskan ke WebView (130%). */
    private static final float MAX_FONT_SCALE = 1.3f;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin lokal harus didaftarkan sebelum bridge dibuat di super.onCreate.
        registerPlugin(FileSaverPlugin.class);
        super.onCreate(savedInstanceState);
        // Konten digambar di bawah status bar & bilah navigasi; sisipannya dibaca CSS lewat
        // env(safe-area-inset-*) dan --safe-area-inset-* dari SystemBars (insetsHandling: 'css').
        // Dipanggil setelah super.onCreate agar decor window dipasang dengan tema aplikasi, bukan
        // tema layar pembuka. Warna ikon status bar kemudian diatur dari web sesuai tema aplikasi.
        EdgeToEdge.enable(this);
        // Latar WebView selama halaman dimuat mengikuti tema sistem (terang/gelap), sama dengan
        // layar pembuka dan animasi intro — tidak ada kilatan hitam sebelum aplikasi tampil.
        int bg = ContextCompat.getColor(this, R.color.splash_bg);
        getWindow().getDecorView().setBackgroundColor(bg);
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            webView.setBackgroundColor(bg);
            // Ukuran huruf mengikuti pengaturan HP, tetapi dibatasi 130% agar tata letak ber-tinggi tetap
            // tidak pecah. fontScale tidak tercantum di configChanges manifest, jadi activity dibuat ulang
            // (dan nilai ini dihitung ulang) setiap kali pengguna mengubah ukuran huruf sistem.
            float fontScale = getResources().getConfiguration().fontScale;
            webView.getSettings().setTextZoom(Math.round(Math.min(fontScale, MAX_FONT_SCALE) * 100));
        }

        // Tombol back: tanyakan ke aplikasi web dulu (tutup dialog → halaman sebelumnya → halaman awal).
        // Hanya bila web tidak menanganinya, aplikasi diminimalkan (bukan ditutup) sehingga data & posisi tetap.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView web = getBridge() != null ? getBridge().getWebView() : null;
                if (web == null) {
                    moveTaskToBack(true);
                    return;
                }
                web.evaluateJavascript("(function(){try{return !!(window.__nativeBack&&window.__nativeBack());}catch(e){return false;}})()", result -> {
                    if (!"true".equals(result)) moveTaskToBack(true);
                });
            }
        });
    }
}
