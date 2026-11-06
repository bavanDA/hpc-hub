// What the ☰ menu used to hold, now that it is gone: Ctrl+, opens Settings and Ctrl+Q quits (Cmd on macOS), the
// window's close button asks while a login is under way (useQuit), and Settings, which also holds the phone app,
// About and "Disconnect all and quit". openSettings() opens it from anywhere.
import { useEffect } from 'react'

import { onOpenSettings } from './openSettings'
import { isMac } from './platform'
import { PreferencesDialog } from './Preferences'
import { useQuit } from './quit'
import type { Experiments } from './types'

export function AppKeys({ settings, onSettings, onClose, onExperimental }: {
  settings: boolean; onSettings: () => void; onClose: () => void; onExperimental: (e: Experiments) => void
}) {
  const quit = useQuit()
  useEffect(() => onOpenSettings(onSettings), [onSettings])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(isMac ? e.metaKey : e.ctrlKey) || e.altKey || e.shiftKey) return
      if (e.key === ',') { e.preventDefault(); onSettings() }
      if (e.key.toLowerCase() === 'q') { e.preventDefault(); quit.quit() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })
  return (
    <>
      {settings && <PreferencesDialog onClose={onClose} onExperimental={onExperimental}
        onDisconnectAndQuit={() => { onClose(); quit.disconnectAndQuit() }} />}
      {quit.dialog}
    </>
  )
}
