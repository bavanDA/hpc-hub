package io.github.bavanda.hpchub

import android.app.Activity
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanIntentResult
import com.journeyapps.barcodescanner.ScanOptions

/** Scans a QR code with the camera (ZXing, open source, so F-Droid takes it). Answers {text}; closing it rejects. */
@TauriPlugin
class ScanPlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun scan(invoke: Invoke) {
    val options = ScanOptions().apply {
      setDesiredBarcodeFormats(ScanOptions.QR_CODE)
      setPrompt("Point the camera at the code on your computer")
      setBeepEnabled(false)
      setOrientationLocked(false)
    }
    startActivityForResult(invoke, ScanContract().createIntent(activity, options), "scanned")
  }

  @ActivityCallback
  fun scanned(invoke: Invoke, result: ActivityResult) {
    val text = ScanIntentResult.parseActivityResult(result.resultCode, result.data).contents
    if (text == null) invoke.reject("Scan cancelled") else invoke.resolve(JSObject().put("text", text))
  }
}
