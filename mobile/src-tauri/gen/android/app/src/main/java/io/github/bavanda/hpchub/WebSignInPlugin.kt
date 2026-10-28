package io.github.bavanda.hpchub

import android.annotation.SuppressLint
import android.app.Activity
import android.app.Dialog
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.webkit.CookieManager
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class SignInArgs {
  lateinit var url: String
  lateinit var title: String
  var cookies: Array<String> = arrayOf() // all of these set for url's site = signed in
}

/** A web sign-in in the app (a cluster's portal): the page full screen, done once its sign-in cookies are set.
 *  Answers {cookies: {name: value}} with all of the site's cookies; closing it answers an error. The cookies stay in the app's WebView, so the
 *  site remembers you next time, like a browser. */
@TauriPlugin
class WebSignInPlugin(private val activity: Activity) : Plugin(activity) {
  private val poll = Handler(Looper.getMainLooper())

  @SuppressLint("SetJavaScriptEnabled")
  @Command
  fun open(invoke: Invoke) {
    val args = invoke.parseArgs(SignInArgs::class.java)
    activity.runOnUiThread {
      val dialog = Dialog(activity, android.R.style.Theme_DeviceDefault_NoActionBar)
      var done = false
      val cookies = CookieManager.getInstance()
      val web = WebView(activity).apply {
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        cookies.setAcceptCookie(true)
        cookies.setAcceptThirdPartyCookies(this, true)
        webViewClient = WebViewClient() // links stay in this page
        loadUrl(args.url)
      }
      fun finish(found: Map<String, String>?) {
        if (done) return
        done = true
        poll.removeCallbacksAndMessages(null)
        dialog.dismiss()
        web.destroy()
        if (found == null) invoke.reject("Sign-in cancelled") else invoke.resolve(JSObject().put("cookies", JSObject().apply {
          found.forEach { (name, value) -> put(name, value) }
        }))
      }
      val check = object : Runnable {
        override fun run() {
          val jar = (cookies.getCookie(args.url) ?: "").split(";").mapNotNull {
            val (name, value) = it.trim().split("=", limit = 2).let { p -> p[0] to p.getOrElse(1) { "" } }
            if (name.isNotEmpty() && value.isNotEmpty()) name to value else null
          }.toMap()
          if (args.cookies.isNotEmpty() && jar.keys.containsAll(args.cookies.toList())) finish(jar)
          else poll.postDelayed(this, 500)
        }
      }
      val bar = LinearLayout(activity).apply {
        gravity = Gravity.CENTER_VERTICAL
        setBackgroundColor(Color.parseColor("#2e2e32"))
        addView(Button(activity).apply { text = "Close"; setOnClickListener { finish(null) } })
        addView(TextView(activity).apply { text = args.title; setTextColor(Color.WHITE); textSize = 17f },
          LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f).apply { marginStart = 24 })
      }
      dialog.setContentView(LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL
        fitsSystemWindows = true
        setBackgroundColor(Color.parseColor("#2e2e32"))
        addView(bar, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        addView(web, LinearLayout.LayoutParams(MATCH_PARENT, 0, 1f))
      })
      dialog.setOnCancelListener { finish(null) }
      dialog.show()
      poll.post(check)
    }
  }
}
