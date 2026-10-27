package io.github.bavanda.hpchub

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    PythonSetup.prepare(this) // before Tauri starts, so the backend inherits its environment
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }
}
