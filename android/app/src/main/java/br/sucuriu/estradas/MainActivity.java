package br.sucuriu.estradas;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;

import androidx.core.content.FileProvider;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/** App Estradas Sucuriú: abre o app web e recebe PDFs do WhatsApp ("Abrir com" e "Compartilhar"). */
public class MainActivity extends Activity {
    static final String BASE = "https://tarcisiometring-estradas.github.io/painel-campo/";
    WebView web;
    ValueCallback<Uri[]> escolha;
    GeolocationPermissions.Callback geoCb; String geoOrigem;
    /* arquivos recebidos esperando a página buscar */
    final List<String> nomes = new ArrayList<>();
    final List<byte[]> dados = new ArrayList<>();

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setAllowFileAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        web.addJavascriptInterface(new Ponte(), "EstradasApp");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (u.toString().startsWith(BASE)) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onGeolocationPermissionsShowPrompt(String origem, GeolocationPermissions.Callback cb) {
                if (temLocal()) cb.invoke(origem, true, true);
                else { geoCb = cb; geoOrigem = origem; requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, 1); }
            }
            @Override public void onPermissionRequest(PermissionRequest r) { r.grant(r.getResources()); }
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (escolha != null) escolha.onReceiveValue(null);
                escolha = cb;
                /* campo de foto com "capture": abre a CÂMERA direto */
                if (p.isCaptureEnabled()) { abrirCamera(); return true; }
                try { startActivityForResult(p.createIntent(), 2); } catch (Exception e) { escolha = null; return false; }
                return true;
            }
        });
        if (Build.VERSION.SDK_INT >= 23 && !temLocal())
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, 1);
        /* só lê o arquivo numa abertura nova; voltar de outro app (ou o Android recriar a tela) não importa de novo */
        boolean deHistorico = (getIntent().getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0;
        boolean chegou = b == null && !deHistorico && receber(getIntent());
        setIntent(new Intent(Intent.ACTION_MAIN));
        if (b != null) web.restoreState(b);
        else web.loadUrl(chegou ? BASE + "meusmapas.html?app=1" : BASE);
    }

    Uri fotoUri;
    void abrirCamera() {
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, 4); return;
        }
        try {
            File dir = new File(getCacheDir(), "fotos"); dir.mkdirs();
            File f = new File(dir, "foto_" + System.currentTimeMillis() + ".jpg");
            fotoUri = FileProvider.getUriForFile(this, "br.sucuriu.estradas.arquivos", f);
            Intent i = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
            i.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, fotoUri);
            i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivityForResult(i, 3);
        } catch (Exception e) { if (escolha != null) { escolha.onReceiveValue(null); escolha = null; } }
    }

    boolean temLocal() {
        return Build.VERSION.SDK_INT < 23 || checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override public void onRequestPermissionsResult(int req, String[] p, int[] g) {
        if (req == 1 && geoCb != null) { geoCb.invoke(geoOrigem, temLocal(), true); geoCb = null; }
        if (req == 4) { if (g.length > 0 && g[0] == PackageManager.PERMISSION_GRANTED) abrirCamera(); else if (escolha != null) { escolha.onReceiveValue(null); escolha = null; } }
    }

    @Override protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        if (receber(i)) web.loadUrl(BASE + "meusmapas.html?app=1");
        setIntent(new Intent(Intent.ACTION_MAIN));
    }

    /** lê o(s) PDF(s) que vieram do WhatsApp */
    boolean receber(Intent i) {
        if (i == null) return false;
        List<Uri> us = new ArrayList<>();
        String a = i.getAction();
        if (Intent.ACTION_VIEW.equals(a) && i.getData() != null) us.add(i.getData());
        else if (Intent.ACTION_SEND.equals(a)) { Uri u = i.getParcelableExtra(Intent.EXTRA_STREAM); if (u != null) us.add(u); }
        else if (Intent.ACTION_SEND_MULTIPLE.equals(a)) { ArrayList<Uri> l = i.getParcelableArrayListExtra(Intent.EXTRA_STREAM); if (l != null) us.addAll(l); }
        boolean ok = false;
        for (Uri u : us) {
            try (InputStream in = getContentResolver().openInputStream(u)) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[65536]; int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                synchronized (dados) { dados.add(out.toByteArray()); nomes.add(nome(u)); }
                ok = true;
            } catch (Exception e) { }
        }
        return ok;
    }

    String nome(Uri u) {
        String n = null;
        try (Cursor c = getContentResolver().query(u, null, null, null, null)) {
            if (c != null && c.moveToFirst()) { int k = c.getColumnIndex(OpenableColumns.DISPLAY_NAME); if (k >= 0) n = c.getString(k); }
        } catch (Exception e) { }
        if (n == null) { n = u.getLastPathSegment(); }
        if (n == null) n = "Mapa.pdf";
        if (!n.toLowerCase().endsWith(".pdf")) n = n + ".pdf";
        return n;
    }

    @Override protected void onActivityResult(int req, int res, Intent d) {
        if (req == 3 && escolha != null) { escolha.onReceiveValue(res == RESULT_OK && fotoUri != null ? new Uri[]{fotoUri} : null); escolha = null; return; }
        if (req == 2 && escolha != null) {
            Uri[] r = null;
            if (res == RESULT_OK && d != null) {
                if (d.getClipData() != null) { int n = d.getClipData().getItemCount(); r = new Uri[n]; for (int k = 0; k < n; k++) r[k] = d.getClipData().getItemAt(k).getUri(); }
                else if (d.getData() != null) r = new Uri[]{d.getData()};
            }
            escolha.onReceiveValue(r); escolha = null;
        }
    }

    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override protected void onSaveInstanceState(Bundle b) { super.onSaveInstanceState(b); web.saveState(b); }

    /** ponte JavaScript ⇄ celular */
    class Ponte {
        @JavascriptInterface public int quantos() { synchronized (dados) { return dados.size(); } }
        @JavascriptInterface public String nome(int k) { synchronized (dados) { return k < nomes.size() ? nomes.get(k) : ""; } }
        @JavascriptInterface public int tamanho(int k) { synchronized (dados) { return k < dados.size() ? dados.get(k).length : 0; } }
        /* pedaços de até 512 KB em base64, para não travar a ponte com PDF grande */
        @JavascriptInterface public String pedaco(int k, int ini, int len) {
            synchronized (dados) {
                if (k >= dados.size()) return "";
                byte[] d = dados.get(k); int fim = Math.min(d.length, ini + len);
                if (ini >= fim) return "";
                return Base64.encodeToString(d, ini, fim - ini, Base64.NO_WRAP);
            }
        }
        @JavascriptInterface public void limpar() { synchronized (dados) { dados.clear(); nomes.clear(); } }
        /* exportar anotações: abre WhatsApp / e-mail com o arquivo */
        @JavascriptInterface public void compartilhar(String nomeArq, String b64, String mime, String texto) {
            try {
                File dir = new File(getCacheDir(), "exportar"); dir.mkdirs();
                File f = new File(dir, nomeArq.replaceAll("[^\\w\\-. ]", "_"));
                try (FileOutputStream o = new FileOutputStream(f)) { o.write(Base64.decode(b64, Base64.DEFAULT)); }
                Uri u = FileProvider.getUriForFile(MainActivity.this, "br.sucuriu.estradas.arquivos", f);
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType(mime); i.putExtra(Intent.EXTRA_STREAM, u); i.putExtra(Intent.EXTRA_TEXT, texto); i.putExtra(Intent.EXTRA_SUBJECT, nomeArq);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                runOnUiThread(() -> startActivity(Intent.createChooser(i, "Enviar anotações")));
            } catch (Exception e) { }
        }
        @JavascriptInterface public String versao() { return "1.0"; }
    }
}
