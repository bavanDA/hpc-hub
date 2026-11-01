// Where the UI runs: in the Tauri window or a plain browser (design preview), and on which system.
export const inTauri = '__TAURI_INTERNALS__' in window

/** macOS draws its own window buttons (traffic lights) over our header. */
export const isMac = /Mac/.test(navigator.platform || navigator.userAgent)
export const isWindows = /Win/.test(navigator.platform || navigator.userAgent)

/** Where logins are kept (hpc_hub/core/credentials.py), for "saved encrypted in ..." */
export const keyStore = isMac ? 'the macOS Keychain' : isWindows ? 'Windows Credential Manager'
  : 'your system keyring'
