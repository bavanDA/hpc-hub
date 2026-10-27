package io.github.bavanda.hpchub

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.File
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** The key of the backend's password file (hpc_hub/core/vault_file.py): random, and stored only wrapped by an
 *  Android Keystore key, which never leaves the phone. */
object Vault {
  private const val ALIAS = "hpc-hub-vault"
  private const val FILE = "vault.key"
  private const val IV = 12

  fun key(context: Context): String {
    val file = File(context.noBackupFilesDir, FILE)
    if (file.exists()) {
      try {
        return hex(unwrap(file.readBytes()))
      } catch (e: Exception) {
        // the Keystore key is gone (app data copied to another phone): start over, passwords asked again
      }
    }
    val key = ByteArray(32).also { SecureRandom().nextBytes(it) }
    file.writeBytes(wrap(key))
    return hex(key)
  }

  private fun keystoreKey(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    val spec = KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setKeySize(256)
      .build()
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply { init(spec) }
      .generateKey()
  }

  private fun wrap(data: ByteArray): ByteArray {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, keystoreKey())
    return cipher.iv + cipher.doFinal(data)
  }

  private fun unwrap(blob: ByteArray): ByteArray {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, keystoreKey(), GCMParameterSpec(128, blob, 0, IV))
    return cipher.doFinal(blob, IV, blob.size - IV)
  }

  private fun hex(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it) }
}
