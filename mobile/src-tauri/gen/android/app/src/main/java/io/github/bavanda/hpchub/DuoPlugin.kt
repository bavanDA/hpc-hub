package io.github.bavanda.hpchub

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

const val DUO_MOBILE = "com.duosecurity.duomobile" // also in AndroidManifest.xml <queries>, or Android hides it

/** Opens Duo Mobile, where the cluster's push waits to be approved. */
@TauriPlugin
class DuoPlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun open(invoke: Invoke) {
    val intent = activity.packageManager.getLaunchIntentForPackage(DUO_MOBILE)
    if (intent == null) {
      invoke.reject("Duo Mobile is not on this phone")
      return
    }
    activity.startActivity(intent)
    invoke.resolve()
  }
}
