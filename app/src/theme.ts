// Light, dark or a named theme (Settings, Appearance): data-theme on <html>, that the colors in index.css follow. A
// named theme sets its light or dark base there and data-tint on top, for its own surfaces and accent.
// public/theme.js sets it before the first paint from the last choice; this keeps it right after that, also when
// the computer switches between light and dark while Appearance is System.

export type Appearance = 'system' | 'light' | 'dark' | 'charcoal' | 'daylight' | 'frost' | 'dusk' | 'sand'

/** Every choice with its line in Settings and the colors of its little sample (background, line, button). */
export const THEMES: { id: Appearance; label: string; note: string; base: 'light' | 'dark' | '';
  sample: [string, string, string] }[] = [
  { id: 'system', label: 'System', note: 'Light or dark, as the computer is', base: '',
    sample: ['#ffffff', '#1c1c1f', '#0a0a0a'] },
  { id: 'light', label: 'Light', note: 'White, black buttons', base: 'light',
    sample: ['#ffffff', '#e6e6e6', '#0a0a0a'] },
  { id: 'dark', label: 'Dark', note: 'Soft grey, white buttons', base: 'dark',
    sample: ['#1c1c1f', '#46464c', '#f2f2f4'] },
  { id: 'charcoal', label: 'Charcoal', note: 'Near-black grey, blue buttons', base: 'dark',
    sample: ['#1f1f1f', '#3c3c3c', '#0078d4'] },
  { id: 'daylight', label: 'Daylight', note: 'White and pale grey, blue buttons', base: 'light',
    sample: ['#ffffff', '#cecece', '#005fb8'] },
  { id: 'frost', label: 'Frost', note: 'Cool blue-grey, icy cyan buttons', base: 'dark',
    sample: ['#2e3440', '#4c566a', '#82b7c6'] },
  { id: 'dusk', label: 'Dusk', note: 'Dusky blue-grey, golden buttons', base: 'dark',
    sample: ['#242936', '#343a48', '#ffcc66'] },
  { id: 'sand', label: 'Sand', note: 'Warm cream paper, gold buttons', base: 'light',
    sample: ['#fdf6e3', '#d3af86', '#ac9d57'] },
]

const CHOSEN: string[] = THEMES.filter((t) => t.base).map((t) => t.id)
const baseOf = (a: Appearance) => THEMES.find((t) => t.id === a)?.base || ''


const KEY = 'hpchub-appearance'
const media = window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()
let current: Appearance = saved()

function saved(): Appearance {
  try {
    const a = localStorage.getItem(KEY)
    return a && CHOSEN.includes(a) ? (a as Appearance) : 'system'
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
  const base = baseOf(current)
  const next = base === 'dark' || (!base && media.matches) ? 'dark' : 'light'
  const root = document.documentElement
  if (current !== 'light' && current !== 'dark' && base) root.dataset.tint = current
  else delete root.dataset.tint
  if (root.dataset.theme === next) return
  root.dataset.theme = next
  listeners.forEach((fn) => fn())
}

/** The window's own title bar and menus too, in the desktop app; nothing to do in a plain browser. */
async function windowTheme(a: Appearance) {
  if (!('__TAURI_INTERNALS__' in window)) return
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().setTheme(baseOf(a) || null)
  } catch {
    // the phone has no window theme; the page colors are what matter
  }
}

export function setAppearance(a: Appearance) {
  current = CHOSEN.includes(a) ? a : 'system'
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
