export const inTauri = '__TAURI_INTERNALS__' in window

/** macOS draws its own window buttons (traffic lights) over our header. */
export const isMac = /Mac/.test(navigator.platform || navigator.userAgent)
