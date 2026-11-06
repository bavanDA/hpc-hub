import { useSyncExternalStore } from 'react'

import { call } from '../../rpc'

// Settings: Monitoring bar. Read once, then kept up to date by the Settings dialog.
let enabled = true
const subscribers = new Set<() => void>()
export const setMonitorBar = (shown: boolean) => { enabled = shown; subscribers.forEach((fn) => fn()) }
call<{ monitor_bar: boolean }>('preferences.get').then((p) => setMonitorBar(p.monitor_bar)).catch(() => {})
export const useEnabled = () =>
  useSyncExternalStore((fn) => { subscribers.add(fn); return () => subscribers.delete(fn) }, () => enabled)
