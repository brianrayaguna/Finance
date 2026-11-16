package com.keuanganku.app;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin lokal harus didaftarkan sebelum bridge dibuat di super.onCreate.
        registerPlugin(FileSaverPlugin.class);
        super.onCreate(savedInstanceState);
        // Latar WebView selama halaman dimuat mengikuti tema sistem (terang/gelap), sama dengan
        // layar pembuka dan animasi intro — tidak ada kilatan hitam sebelum aplikasi tampil.
        int bg = ContextCompat.getColor(this, R.color.splash_bg);
        getWindow().getDecorView().setBackgroundColor(bg);
        if (getBridge() != null && getBridge().getWebView() != null) getBridge().getWebView().setBackgroundColor(bg);

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
