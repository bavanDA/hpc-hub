import { useEffect, useState } from 'react'

import { isToggle } from './panel'

const HEIGHT = 'code.terminal.height'
let panelShown = false  // kept while you visit other pages

/** The terminal panel under the editor: shown or not, its height, and Ctrl+` to toggle it (even from inside one). */
export function useTerminalPanel(root: string) {
  const [panel, setPanelState] = useState(panelShown)
  const [height, setHeightState] = useState(() => {
    try { return Number(localStorage.getItem(HEIGHT)) || 260 } catch { return 260 }
  })
  const setPanel = (on: boolean) => { panelShown = on; setPanelState(on) }

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!isToggle(e) || !root) return
      e.preventDefault()
      e.stopPropagation()
      setPanel(!panelShown)
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [root])

  const setHeight = (h: number, done: boolean) => {
    setHeightState(h)
    if (done) try { localStorage.setItem(HEIGHT, String(h)) } catch { /* private window */ }
  }
  return { panel, setPanel, height, setHeight }
}
