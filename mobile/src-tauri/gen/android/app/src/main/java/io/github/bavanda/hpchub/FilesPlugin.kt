package io.github.bavanda.hpchub

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import androidx.activity.result.ActivityResult
import androidx.core.content.FileProvider
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.util.concurrent.Executors

@InvokeArg
class PickArgs {
  var multiple: Boolean = false
  var mime: Array<String> = arrayOf() // empty: any file
}

@InvokeArg
class SaveArgs {
  lateinit var path: String // a file in the app's cache
  lateinit var name: String
}

@InvokeArg
class OpenArgs {
  lateinit var path: String // a file path, or a content:// link from save
  var mime: String? = null
}

@InvokeArg
class ShareArgs {
  var path: String? = null
  var text: String? = null
  var title: String? = null
}

/** Files between the phone and the backend, which only reads and writes paths:
 *  pick = Android's file picker, copied into the cache; save = into Downloads/HPC Hub; open and share = other apps. */
@TauriPlugin
class FilesPlugin(private val activity: Activity) : Plugin(activity) {
  private val work = Executors.newSingleThreadExecutor() // copies stay off the screen's thread
  private val main = Handler(Looper.getMainLooper())
  private var saving: Pair<File, String>? = null // the file and name waiting for the "save as" picker (Android 9 and older)

  @Command
  fun pick(invoke: Invoke) {
    val args = invoke.parseArgs(PickArgs::class.java)
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = "*/*"
      if (args.mime.isNotEmpty()) putExtra(Intent.EXTRA_MIME_TYPES, args.mime)
      putExtra(Intent.EXTRA_ALLOW_MULTIPLE, args.multiple)
    }
    startActivityForResult(invoke, intent, "picked")
  }

  @ActivityCallback
  fun picked(invoke: Invoke, result: ActivityResult) {
    val data = result.data
    if (result.resultCode != Activity.RESULT_OK || data == null) {
      invoke.resolve(JSObject().put("files", JSArray())) // closed the picker: nothing chosen
      return
    }
    val uris = data.clipData?.let { clip -> (0 until clip.itemCount).map { clip.getItemAt(it).uri } }
      ?: listOfNotNull(data.data)
    work.execute {
      try {
        val dir = File(activity.cacheDir, "picked/${System.currentTimeMillis()}").apply { mkdirs() }
        val files = JSArray()
        for (uri in uris) files.put(copyIn(uri, dir))
        main.post { invoke.resolve(JSObject().put("files", files)) }
      } catch (e: Exception) {
        main.post { invoke.reject("Couldn't read the file: ${e.message}") }
      }
    }
  }

  private fun copyIn(uri: Uri, dir: File): JSObject {
    var name = "file"
    activity.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
      if (it.moveToFirst() && !it.isNull(0)) name = it.getString(0)
    }
    val target = File(dir, name.replace('/', '_'))
    activity.contentResolver.openInputStream(uri).use { input ->
      requireNotNull(input) { "Android gave no data for $name" }
      target.outputStream().use { input.copyTo(it) }
    }
    return JSObject().put("name", target.name).put("path", target.absolutePath).put("size", target.length())
      .put("mime", activity.contentResolver.getType(uri) ?: mimeOf(target.name))
  }

  @Command
  fun save(invoke: Invoke) {
    val args = invoke.parseArgs(SaveArgs::class.java)
    val source = File(args.path)
    if (!source.isFile) {
      invoke.reject("There's no file to save")
      return
    }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) { // no Downloads collection yet: you pick where it goes
      saving = source to args.name
      val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = mimeOf(args.name)
        putExtra(Intent.EXTRA_TITLE, args.name)
      }
      startActivityForResult(invoke, intent, "savedAs")
      return
    }
    work.execute {
      try {
        val values = ContentValues().apply {
          put(MediaStore.Downloads.DISPLAY_NAME, args.name)
          put(MediaStore.Downloads.MIME_TYPE, mimeOf(args.name))
          put(MediaStore.Downloads.RELATIVE_PATH, "Download/HPC Hub")
          put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val resolver = activity.contentResolver
        val uri = requireNotNull(resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)) {
          "Android didn't make the file"
        }
        copyOut(source, uri)
        resolver.update(uri, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
        main.post { invoke.resolve(JSObject().put("uri", uri.toString()).put("place", "Downloads/HPC Hub/${args.name}")) }
      } catch (e: Exception) {
        main.post { invoke.reject("Couldn't save to Downloads: ${e.message}") }
      }
    }
  }

  @ActivityCallback
  fun savedAs(invoke: Invoke, result: ActivityResult) {
    val (source, name) = saving ?: return invoke.reject("There's no file to save")
    saving = null
    val uri = result.data?.data
    if (result.resultCode != Activity.RESULT_OK || uri == null) {
      invoke.reject("Saving cancelled")
      return
    }
    work.execute {
      try {
        copyOut(source, uri)
        main.post { invoke.resolve(JSObject().put("uri", uri.toString()).put("place", name)) }
      } catch (e: Exception) {
        main.post { invoke.reject("Couldn't save the file: ${e.message}") }
      }
    }
  }

  /** Copies into uri, then removes the cache copy (only ever a file in the app's cache). */
  private fun copyOut(source: File, uri: Uri) {
    activity.contentResolver.openOutputStream(uri).use { out ->
      requireNotNull(out) { "Android gave nowhere to write" }
      source.inputStream().use { it.copyTo(out) }
    }
    if (source.canonicalPath.startsWith(activity.cacheDir.canonicalPath)) source.delete()
  }

  @Command
  fun open(invoke: Invoke) {
    val args = invoke.parseArgs(OpenArgs::class.java)
    try {
      val uri = linkTo(args.path)
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, args.mime ?: activity.contentResolver.getType(uri) ?: mimeOf(args.path))
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      activity.startActivity(intent)
      invoke.resolve()
    } catch (e: ActivityNotFoundException) {
      invoke.reject("No app on this phone opens this kind of file")
    } catch (e: IllegalArgumentException) {
      invoke.reject("HPC Hub can only open files it saved or downloaded")
    }
  }

  @Command
  fun share(invoke: Invoke) {
    val args = invoke.parseArgs(ShareArgs::class.java)
    val intent = Intent(Intent.ACTION_SEND)
    try {
      val path = args.path
      if (path != null) {
        val uri = linkTo(path)
        intent.type = activity.contentResolver.getType(uri) ?: mimeOf(path)
        intent.putExtra(Intent.EXTRA_STREAM, uri)
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      } else {
        intent.type = "text/plain"
      }
      args.text?.let { intent.putExtra(Intent.EXTRA_TEXT, it) }
      args.title?.let { intent.putExtra(Intent.EXTRA_SUBJECT, it) }
      activity.startActivity(Intent.createChooser(intent, args.title))
      invoke.resolve()
    } catch (e: IllegalArgumentException) {
      invoke.reject("HPC Hub can only share files it saved or downloaded")
    }
  }

  /** A content:// link other apps may read: as given, or through the FileProvider for the app's own files. */
  private fun linkTo(path: String): Uri =
    if (path.startsWith("content://")) Uri.parse(path)
    else FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", File(path))

  private fun mimeOf(name: String): String =
    MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substringAfterLast('.', "").lowercase())
      ?: "application/octet-stream"
}
