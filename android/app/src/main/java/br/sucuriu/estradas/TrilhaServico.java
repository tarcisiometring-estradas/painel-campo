package br.sucuriu.estradas;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.text.format.DateFormat;
import android.os.IBinder;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.os.PowerManager;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Grava a trilha pelo GPS mesmo com a tela desligada (serviço em primeiro plano, com aviso fixo).
 * Os pontos ficam numa lista e num arquivo (sobrevivem se o Android fechar o app);
 * a página busca os pontos pela ponte (EstradasApp.trilhaPontos).
 */
public class TrilhaServico extends Service implements LocationListener {
    static final String CANAL = "trilha";
    static final int AVISO = 7;
    /* cada ponto: "lat,lon,precisão,hora(ms)" */
    static final List<String> PONTOS = new ArrayList<>();
    static volatile boolean ativo = false;
    static boolean carregado = false;
    PowerManager.WakeLock trava;
    LocationManager lm;
    Handler vigia;
    long ultFix = 0; int novos = 0;

    static File arquivo(Context c) { return new File(c.getFilesDir(), "trilha_em_andamento.txt"); }

    /** lê do arquivo os pontos de uma trilha que o Android tenha interrompido */
    static void carregar(Context c) {
        synchronized (PONTOS) {
            if (carregado) return;
            carregado = true;
            File f = arquivo(c);
            if (!f.exists()) return;
            try (BufferedReader r = new BufferedReader(new FileReader(f))) {
                String l; while ((l = r.readLine()) != null) if (l.length() > 5) PONTOS.add(l);
            } catch (Exception e) { }
        }
    }

    static void limpar(Context c) {
        synchronized (PONTOS) { PONTOS.clear(); carregado = true; arquivo(c).delete(); }
    }

    @Override public void onCreate() {
        super.onCreate();
        carregar(this);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CANAL, "Gravação de trilha", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Aparece enquanto o app grava a trilha pelo GPS");
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(ch);
        }
    }

    Notification aviso(String texto) {
        Intent abre = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, abre, PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CANAL) : new Notification.Builder(this);
        b.setContentTitle("Gravando trilha").setContentText(texto).setSmallIcon(android.R.drawable.ic_menu_mylocation)
         .setOngoing(true).setContentIntent(pi);
        return b.build();
    }

    @Override public int onStartCommand(Intent i, int flags, int id) {
        Notification n = aviso("O GPS continua gravando com a tela desligada");
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(AVISO, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            else startForeground(AVISO, n);
        } catch (Exception e) { stopSelf(); return START_NOT_STICKY; }
        if (!ativo) {
            ativo = true;
            try {
                PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                trava = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "estradas:trilha");
                trava.acquire(12 * 60 * 60 * 1000L);
            } catch (Exception e) { }
            if (!registrar()) { parar(); return START_NOT_STICKY; }
            ultFix = SystemClock.elapsedRealtime();
            vigia = new Handler(Looper.getMainLooper());
            vigia.postDelayed(ronda, 20000);
        }
        return START_STICKY;
    }

    /** liga o GPS; usado também pelo vigia para religar quando o celular "esquece" o GPS com a tela apagada */
    boolean registrar() {
        try {
            if (lm == null) lm = (LocationManager) getSystemService(LOCATION_SERVICE);
            try { lm.removeUpdates(this); } catch (Exception e) { }
            lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000, 0, this, Looper.getMainLooper());
            return true;
        } catch (SecurityException e) { return false; } catch (Exception e) { return true; }
    }
    /* a cada 20 s: se o GPS ficou 30 s mudo, religa (Samsung costuma parar o GPS com a tela apagada) */
    final Runnable ronda = new Runnable() { @Override public void run() {
        if (!ativo) return;
        if (SystemClock.elapsedRealtime() - ultFix > 30000) { registrar(); ultFix = SystemClock.elapsedRealtime(); }
        try { if (trava != null && !trava.isHeld()) trava.acquire(12 * 60 * 60 * 1000L); } catch (Exception e) { }
        if (vigia != null) vigia.postDelayed(this, 20000);
    } };

    @Override public void onLocationChanged(Location l) {
        /* descarta posição velha (cache) que o Android às vezes entrega quando o GPS volta */
        if (Build.VERSION.SDK_INT >= 17 && SystemClock.elapsedRealtimeNanos() - l.getElapsedRealtimeNanos() > 10_000_000_000L) return;
        ultFix = SystemClock.elapsedRealtime();
        String p = String.format(Locale.US, "%.7f,%.7f,%.1f,%d", l.getLatitude(), l.getLongitude(), l.hasAccuracy() ? l.getAccuracy() : 99f, l.getTime());
        synchronized (PONTOS) {
            PONTOS.add(p);
            try (FileWriter w = new FileWriter(arquivo(this), true)) { w.write(p + "\n"); } catch (Exception e) { }
        }
        if (++novos % 30 == 0) try {
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(AVISO, aviso("GPS gravando · " + quantos(this) + " posições · " + DateFormat.format("HH:mm", System.currentTimeMillis())));
        } catch (Exception e) { }
    }
    @Override public void onStatusChanged(String s, int st, Bundle b) { }
    @Override public void onProviderEnabled(String s) { }
    @Override public void onProviderDisabled(String s) { }

    void parar() {
        ativo = false;
        if (vigia != null) vigia.removeCallbacks(ronda);
        try { if (lm != null) lm.removeUpdates(this); } catch (Exception e) { }
        try { if (trava != null && trava.isHeld()) trava.release(); } catch (Exception e) { }
        stopForeground(true);
        stopSelf();
    }

    @Override public void onDestroy() {
        ativo = false;
        if (vigia != null) vigia.removeCallbacks(ronda);
        try { if (lm != null) lm.removeUpdates(this); } catch (Exception e) { }
        try { if (trava != null && trava.isHeld()) trava.release(); } catch (Exception e) { }
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent i) { return null; }

    /* ---- usado pela ponte ---- */
    static void iniciar(Context c) {
        Intent i = new Intent(c, TrilhaServico.class);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }
    static void pararServico(Context c) {
        ativo = false;
        c.stopService(new Intent(c, TrilhaServico.class));
    }
    static String pontos(Context c, int desde) {
        carregar(c);
        StringBuilder sb = new StringBuilder("[");
        synchronized (PONTOS) {
            for (int k = Math.max(0, desde); k < PONTOS.size(); k++) { if (sb.length() > 1) sb.append(','); sb.append('[').append(PONTOS.get(k)).append(']'); }
        }
        return sb.append(']').toString();
    }
    static int quantos(Context c) { carregar(c); synchronized (PONTOS) { return PONTOS.size(); } }
}
