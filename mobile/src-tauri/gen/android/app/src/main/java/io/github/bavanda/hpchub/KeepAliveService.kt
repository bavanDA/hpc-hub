package io.github.bavanda.hpchub

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.net.Uri
import android.os.IBinder
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

private const val CHANNEL = "connections"
private const val ID = 1
private const val EXTRA_TEXT = "text"

/** Keeps the app (and so its SSH connections, the backend and the VPN tunnels it runs) going while you use other
 *  apps or the screen is off, shown as an ongoing "Connected to Wulver" notification. Android lets an app with this
 *  service use the network in Doze, and openconnect, as one of the app's own processes, gets that too. Optional:
 *  tmux and Slurm keep your work alive on the cluster anyway. */
class KeepAliveService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: "Staying connected"
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL, "Connections", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Shown while HPC Hub stays connected in the background"
        })
    }
    val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE)
    val notification: Notification = NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_connected)
      .setContentTitle(text)
      .setContentText("HPC Hub keeps your connections open. Tap to open.")
      .setContentIntent(open)
      .setOngoing(true)
      .setSilent(true)
      .build()
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
      ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
    ServiceCompat.startForeground(this, ID, notification, type)
    return START_NOT_STICKY // after Android kills the app, the next start reconnects anyway
  }

  override fun onTaskRemoved(rootIntent: Intent?) { // swiped away from recents: you closed HPC Hub, so stop
    stopSelf()
  }
}

@InvokeArg
class KeepAliveArgs {
  var on: Boolean = false
  var text: String? = null // "Connected to Wulver (NJIT)"
}

@TauriPlugin
class KeepAlivePlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun set(invoke: Invoke) {
    val args = invoke.parseArgs(KeepAliveArgs::class.java)
    val intent = Intent(activity, KeepAliveService::class.java)
    try {
      if (args.on) {
        ContextCompat.startForegroundService(activity, intent.putExtra(EXTRA_TEXT, args.text))
      } else {
        activity.stopService(intent)
      }
      invoke.resolve()
    } catch (e: Exception) { // Android refuses to start it from the background
      invoke.reject("Android didn't let HPC Hub stay connected: ${e.message}")
    }
  }

  @Command
  fun batteryStatus(invoke: Invoke) {
    val power = activity.getSystemService(Context.POWER_SERVICE) as PowerManager
    val answer = JSObject()
    answer.put("unrestricted", power.isIgnoringBatteryOptimizations(activity.packageName))
    invoke.resolve(answer)
  }

  /** Android's own question; where a phone doesn't have it, its list of apps. */
  @Command
  fun batteryAsk(invoke: Invoke) {
    try {
      activity.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
        Uri.parse("package:${activity.packageName}")))
    } catch (e: ActivityNotFoundException) {
      activity.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
    }
    invoke.resolve()
  }
}
