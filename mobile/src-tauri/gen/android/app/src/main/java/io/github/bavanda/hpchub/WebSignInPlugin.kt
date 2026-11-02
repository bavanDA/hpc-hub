package io.github.bavanda.hpchub

import android.annotation.SuppressLint
import android.app.Activity
import android.app.Dialog
import android.graphics.Color
import android.net.Uri
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
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject

@InvokeArg
class SignInArgs {
  lateinit var url: String
  lateinit var title: String
  var cookies: Array<String> = arrayOf() // all of these set for url's site = signed in
  var closeIsDone: Boolean = false // a page you fill in yourself: Done answers instead of cancelling
  var finalUrl: String = "" // reaching it = signed in: answers the cookies set for it (the VPN's sign-in)
  var fill: String = "" // the fill script with your login in it (websignin.rs); empty: you type it
  var clicks: String = "" // notes a link you clicked yourself, so filling in stops
  var fillSite: String = "" // pages there (and on fillHosts) may get the login, over https only
  var fillHosts: Array<String> = arrayOf()
}

/** A web sign-in in the app: the page full screen. Done once its sign-in cookies are set (a cluster's portal), or
 *  once it reaches finalUrl (the VPN's sign-in, with the saved login filled in as the desktop's sso.rs does).
 *  Answers {cookies: {name: value}}; closing it answers an error (or, with closeIsDone, the cookies there are).
 *  The cookies stay in the app's WebView, so the site remembers you next time, like a browser. */
@TauriPlugin
class WebSignInPlugin(private val activity: Activity) : Plugin(activity) {
  private val poll = Handler(Looper.getMainLooper())
  private var closeOpen: (() -> Unit)? = null

  @Command
  fun close(invoke: Invoke) {
    activity.runOnUiThread {
      closeOpen?.invoke()
      invoke.resolve()
    }
  }

  @SuppressLint("SetJavaScriptEnabled")
  @Command
  fun open(invoke: Invoke) {
    val args = invoke.parseArgs(SignInArgs::class.java)
    activity.runOnUiThread {
      closeOpen?.invoke() // one page at a time
      val dialog = Dialog(activity, android.R.style.Theme_DeviceDefault_NoActionBar)
      var done = false
      var fill = args.fill
      var doneUser = false
      var donePass = false
      var off = false // you clicked a link yourself: from then on you type
      var timer = false
      val cookies = CookieManager.getInstance()
      val title = TextView(activity).apply { text = args.title; setTextColor(Color.WHITE); textSize = 17f }
      lateinit var web: WebView

      fun jar(url: String): Map<String, String> = (cookies.getCookie(url) ?: "").split(";").mapNotNull {
        val (name, value) = it.trim().split("=", limit = 2).let { p -> p[0] to p.getOrElse(1) { "" } }
        if (name.isNotEmpty() && value.isNotEmpty()) name to value else null
      }.toMap()
      fun finish(found: Map<String, String>?) {
        if (done) return
        done = true
        fill = "" // the login is forgotten here
        closeOpen = null
        poll.removeCallbacksAndMessages(null)
        dialog.dismiss()
        web.destroy()
        if (found == null) invoke.reject("Sign-in cancelled") else invoke.resolve(JSObject().put("cookies", JSObject().apply {
          found.forEach { (name, value) -> put(name, value) }
        }))
      }
      fun mayFill(url: String): Boolean {
        val page = Uri.parse(url)
        val host = (page.host ?: "").lowercase()
        val site = args.fillSite.lowercase()
        return page.scheme == "https" && host.isNotEmpty() &&
          (host in args.fillHosts || (site.isNotEmpty() && (host == site || host.endsWith(".$site"))))
      }
      lateinit var step: () -> Unit
      fun later(ms: Long) {
        timer = true
        poll.postDelayed({ step() }, ms)
      }
      step = step@{
        timer = false
        if (done || donePass || off || fill.isEmpty()) return@step
        val url = web.url ?: ""
        if (!mayFill(url)) {
          later(POLL) // not a page we trust with the password; it may redirect to one
          return@step
        }
        val host = JSONObject.quote(Uri.parse(url).host ?: "")
        val script = fill.replace("__hpcHubDoneUser__", doneUser.toString()).replace("__hpcHubDonePass__", donePass.toString())
        // the page may have moved on since the check: fill in only if it is still on the host that was checked
        web.evaluateJavascript("(function () { if ($CLICKED) return 'off'; " +
          "if (location.protocol !== 'https:' || location.hostname !== $host) return ''; return $script })()") { out ->
          when (out?.trim('"')) {
            "off" -> off = true
            "pass" -> {
              donePass = true
              title.text = "Password sent. Approve Duo on your phone."
            }
            "user" -> {
              doneUser = true
              later(SETTLE) // after the username, let the password page settle before typing
            }
            else -> if (!timer) later(POLL) // no field yet: look again soon
          }
        }
      }

      web = WebView(activity).apply {
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        cookies.setAcceptCookie(true)
        cookies.setAcceptThirdPartyCookies(this, true)
        val early = args.clicks.isNotEmpty() && WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
        if (early) WebViewCompat.addDocumentStartJavaScript(this, args.clicks, setOf("*"))
        webViewClient = object : WebViewClient() { // links stay in this page
          override fun onPageFinished(view: WebView, url: String) {
            if (done) return
            if (args.finalUrl.isNotEmpty() && url.startsWith(args.finalUrl)) return finish(jar(args.finalUrl))
            if (!early && args.clicks.isNotEmpty()) view.evaluateJavascript(args.clicks, null)
            if (fill.isNotEmpty() && !donePass && !off && !timer) later(SETTLE)
          }
        }
        loadUrl(args.url)
      }
      val check = object : Runnable {
        override fun run() {
          val found = jar(args.url)
          if (found.keys.containsAll(args.cookies.toList())) finish(found)
          else poll.postDelayed(this, 500)
        }
      }
      val bar = LinearLayout(activity).apply {
        gravity = Gravity.CENTER_VERTICAL
        setBackgroundColor(Color.parseColor("#2e2e32"))
        addView(Button(activity).apply {
          text = if (args.closeIsDone) "Done" else "Close"
          setOnClickListener { finish(if (args.closeIsDone) jar(args.url) else null) }
        })
        addView(title, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f).apply { marginStart = 24 })
      }
      dialog.setContentView(LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL
        fitsSystemWindows = true
        setBackgroundColor(Color.parseColor("#2e2e32"))
        addView(bar, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        addView(web, LinearLayout.LayoutParams(MATCH_PARENT, 0, 1f))
      })
      dialog.setOnCancelListener { finish(if (args.closeIsDone) jar(args.url) else null) }
      closeOpen = { finish(null) }
      dialog.show()
      if (args.cookies.isNotEmpty()) poll.post(check)
    }
  }

  companion object {
    const val SETTLE = 2800L // ms before typing into a freshly loaded page (sign-in pages finish their scripts late)
    const val POLL = 800L
    const val CLICKED = "!!(window.__hpcHubLinkClicked && window.__hpcHubLinkClicked())"
  }
}
