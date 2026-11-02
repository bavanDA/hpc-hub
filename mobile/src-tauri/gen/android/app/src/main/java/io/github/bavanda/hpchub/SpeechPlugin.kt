package io.github.bavanda.hpchub

import android.app.Activity
import android.media.AudioAttributes
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.appcompat.app.AppCompatActivity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class ListenArgs {
  lateinit var channel: Channel
}

@InvokeArg
class SpeakArgs {
  lateinit var id: String // comes back with every event about this text
  lateinit var text: String
  var voice: String? = null // a name from voices; none: the phone's default
  var rate: Float = 1f
  var flush: Boolean = false // drop what is still queued first
}

const val NO_ENGINE = "This phone has no text to speech voice. Add one in the phone's Settings, under Text-to-speech output."

/** Android's own text to speech, for Read aloud: the voices, speaking queued texts, and progress events (start,
 *  range for each word on Android 8+, done, stop, error) to the channel from listen. */
@TauriPlugin
class SpeechPlugin(private val activity: Activity) : Plugin(activity) {
  private var tts: TextToSpeech? = null
  private var state = 0 // 0 not started, 1 starting, 2 ready, 3 failed
  private val waiting = mutableListOf<(TextToSpeech?) -> Unit>()
  private var channel: Channel? = null

  /** The engine once it has started (null: it can't), starting it on first use. */
  private fun engine(then: (TextToSpeech?) -> Unit) {
    synchronized(this) {
      when (state) {
        2 -> return then(tts)
        3 -> return then(null)
        else -> waiting.add(then)
      }
      if (state == 1) return
      state = 1
    }
    activity.runOnUiThread {
      tts = TextToSpeech(activity) { status ->
        val ok = status == TextToSpeech.SUCCESS
        val ready = synchronized(this) {
          state = if (ok) 2 else 3
          waiting.toList().also { waiting.clear() }
        }
        if (ok) tts?.apply {
          setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
          setOnUtteranceProgressListener(progress)
        }
        ready.forEach { it(if (ok) tts else null) }
      }
    }
  }

  private fun send(kind: String, id: String?, start: Int = -1, end: Int = -1) {
    val event = JSObject()
    event.put("kind", kind)
    event.put("id", id ?: "")
    if (start >= 0) { event.put("start", start); event.put("end", end) }
    channel?.send(event)
  }

  private val progress = object : UtteranceProgressListener() {
    override fun onStart(id: String?) = send("start", id)
    override fun onDone(id: String?) = send("done", id)
    @Deprecated("Deprecated in Java")
    override fun onError(id: String?) = send("error", id)
    override fun onError(id: String?, code: Int) = send("error", id)
    override fun onStop(id: String?, interrupted: Boolean) = send("stop", id)
    override fun onRangeStart(id: String?, start: Int, end: Int, frame: Int) = send("range", id, start, end)
  }

  @Command
  fun listen(invoke: Invoke) {
    channel = invoke.parseArgs(ListenArgs::class.java).channel
    invoke.resolve()
  }

  /** {voices: [{name, lang, offline}], default}: the voices that work now (online ones need the internet). */
  @Command
  fun voices(invoke: Invoke) {
    engine { t ->
      if (t == null) return@engine invoke.reject(NO_ENGINE)
      val list = JSArray()
      for (v in t.voices.orEmpty()) {
        if (v.features?.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED) == true) continue
        list.put(JSObject().apply {
          put("name", v.name)
          put("lang", v.locale.toLanguageTag())
          put("offline", !v.isNetworkConnectionRequired)
        })
      }
      invoke.resolve(JSObject().apply {
        put("voices", list)
        put("default", t.defaultVoice?.name ?: t.voice?.name ?: "")
      })
    }
  }

  @Command
  fun speak(invoke: Invoke) {
    val args = invoke.parseArgs(SpeakArgs::class.java)
    engine { t ->
      if (t == null) return@engine invoke.reject(NO_ENGINE)
      val voice = args.voice?.let { name -> t.voices.orEmpty().find { it.name == name } }
      if (voice != null && voice != t.voice) t.voice = voice
      t.setSpeechRate(args.rate)
      val queue = if (args.flush) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD
      if (t.speak(args.text, queue, Bundle(), args.id) == TextToSpeech.SUCCESS) invoke.resolve()
      else invoke.reject("The phone's voice could not start")
    }
  }

  @Command
  fun stop(invoke: Invoke) {
    tts?.stop()
    invoke.resolve()
  }

  override fun onDestroy(activity: AppCompatActivity) {
    tts?.shutdown()
    tts = null
  }
}
