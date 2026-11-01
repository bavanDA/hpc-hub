// Is the on-screen keyboard up while a code editor has the focus? One set of listeners, shared by the Code tab (its
// key row) and App.tsx (the bottom tabs give their room to the editor). Android shrinks the visual viewport, not the
// window, when the keyboard opens.
import { useSyncExternalStore } from 'react'

const LIFT = 120  // px the visual viewport shrinks by before it counts as a keyboard, not a toolbar

let up = false
const listeners = new Set<() => void>()
let stop: (() => void) | null = null

function check() {
  const typing = !!document.activeElement?.closest('.cm-editor')
  const vv = window.visualViewport
  const next = typing && (vv ? window.innerHeight - vv.height > LIFT : true)
  if (next === up) return
  up = next
  listeners.forEach((fn) => fn())
}

function start() {
  const vv = window.visualViewport
  let later = 0
  const left = () => { later = window.setTimeout(check, 50) }  // focus moves on the next tick
  vv?.addEventListener('resize', check)
  document.addEventListener('focusin', check)
  document.addEventListener('focusout', left)
  return () => {
    vv?.removeEventListener('resize', check)
    document.removeEventListener('focusin', check)
    document.removeEventListener('focusout', left)
    clearTimeout(later)
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  if (!stop) stop = start()
  return () => {
    listeners.delete(fn)
    if (!listeners.size && stop) { stop(); stop = null; up = false }
  }
}

export function useEditorKeyboard(): boolean {
  return useSyncExternalStore(subscribe, () => up, () => false)
}
