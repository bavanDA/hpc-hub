package io.github.bavanda.hpchub

import android.content.Context
import android.os.Build
import android.system.Os
import java.io.File
import java.util.zip.ZipInputStream

/** Puts the backend's Python files in place and sets the environment it inherits (docs/design/android.md). */
object PythonSetup {

  fun prepare(context: Context) {
    val files = context.filesDir
    val python = File(files, "python")
    unpack(context, python)
    val libs = context.applicationInfo.nativeLibraryDir
    val env = mapOf(
      "HPC_HUB_LAUNCHER" to "$libs/libhpchub_backend.so",
      "PYTHONHOME" to python.path,
      "LD_LIBRARY_PATH" to libs,
      "HOME" to dir(files, "home"),
      "XDG_CONFIG_HOME" to dir(files, "config"),
      "XDG_DATA_HOME" to dir(files, "data"),
      "XDG_RUNTIME_DIR" to dir(files, "run"),
      "XDG_CACHE_HOME" to context.cacheDir.path,
      "TMPDIR" to context.cacheDir.path,
      "HPC_HUB_SSH" to "asyncssh", // no OpenSSH on Android
      "HPC_HUB_VAULT_KEY" to Vault.key(context),
      "PYTHONUNBUFFERED" to "1",
      "CRYPTOGRAPHY_OPENSSL_NO_LEGACY" to "1", // old ciphers SSH never uses; their module is not shipped
    )
    for ((name, value) in env) Os.setenv(name, value, true)
  }

  /** Once per install or update: an update brings new files. */
  private fun unpack(context: Context, home: File) {
    val version = context.packageManager.getPackageInfo(context.packageName, 0).lastUpdateTime.toString()
    val stamp = File(home, ".stamp")
    if (stamp.exists() && stamp.readText() == version) return
    home.deleteRecursively()
    home.mkdirs()
    val root = home.canonicalPath + File.separator
    context.assets.open(bundle(context)).use { raw ->
      ZipInputStream(raw.buffered()).use { zip ->
        while (true) {
          val entry = zip.nextEntry ?: break
          val out = File(home, entry.name)
          if (!out.canonicalPath.startsWith(root)) continue
          if (entry.isDirectory) {
            out.mkdirs()
          } else {
            out.parentFile?.mkdirs()
            out.outputStream().use { zip.copyTo(it) }
          }
        }
      }
    }
    stamp.writeText(version)
  }

  /** python-<abi>.zip (mobile/python/build.sh) for this phone's processor. */
  private fun bundle(context: Context): String {
    val shipped = context.assets.list("").orEmpty().toSet()
    return Build.SUPPORTED_ABIS.map { "python-$it.zip" }.firstOrNull { it in shipped }
      ?: error("This HPC Hub has no Python for ${Build.SUPPORTED_ABIS.joinToString()}")
  }

  private fun dir(parent: File, name: String): String = File(parent, name).apply { mkdirs() }.path
}
