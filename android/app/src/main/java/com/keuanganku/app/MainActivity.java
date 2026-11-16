package com.keuanganku.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin lokal harus didaftarkan sebelum bridge dibuat di super.onCreate.
        registerPlugin(FileSaverPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
