// Light or dark (Settings, Appearance): one attribute on <html>, data-theme, that the colors in index.css follow.
// public/theme.js sets it before the first paint from the last choice; this keeps it right after that, also when
// the computer switches between light and dark while Appearance is System.

export type Appearance = 'system' | 'light' | 'dark'

const KEY = 'hpchub-appearance'
const media = window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()
let current: Appearance = saved()

function saved(): Appearance {
  try {
    const a = localStorage.getItem(KEY)
    return a === 'light' || a === 'dark' ? a : 'system'
  } catch {
    return 'system'  // storage blocked: follow the computer
  }
}

export const isDark = () => document.documentElement.dataset.theme === 'dark'

/** fn runs whenever the app turns light or dark (terminals repaint their colors). */
export function onThemeChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

function paint() {
  const next = current === 'dark' || (current === 'system' && media.matches) ? 'dark' : 'light'
  if (document.documentElement.dataset.theme === next) return
  document.documentElement.dataset.theme = next
  listeners.forEach((fn) => fn())
}

/** The window's own title bar and menus too, in the desktop app; nothing to do in a plain browser. */
async function windowTheme(a: Appearance) {
  if (!('__TAURI_INTERNALS__' in window)) return
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().setTheme(a === 'system' ? null : a)
  } catch {
    // the phone has no window theme; the page colors are what matter
  }
}

export function setAppearance(a: Appearance) {
  current = a === 'light' || a === 'dark' ? a : 'system'
  try {
    localStorage.setItem(KEY, current)
  } catch {
    // remembered by the backend anyway (app.toml), only the first paint of the next start may differ
  }
  paint()
  void windowTheme(current)
}

media.addEventListener('change', paint)
paint()
