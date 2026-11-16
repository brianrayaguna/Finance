package com.keuanganku.app;

import android.os.Bundle;
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
    }
}
