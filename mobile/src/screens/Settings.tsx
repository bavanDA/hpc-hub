// More › Settings: light or dark, the monitoring bar. Clusters you use, notifications and keeping connected in the
// background come next.
import { useEffect, useState } from 'react'

import { setMonitorBar } from '@shared/components/terminals/MonitorBar'
import { call } from '@shared/rpc'
import { setAppearance, type Appearance } from '@shared/theme'
import { Header } from '../parts/Header'
import { Card, Segments, Switch, useToast } from '../ui'

type Prefs = { monitor_bar: boolean; appearance: Appearance }

const THEMES = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']] as const

export function Settings() {
  const toast = useToast()
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  useEffect(() => { call<Prefs>('preferences.get').then(setPrefs).catch((e: Error) => toast(e.message)) }, [toast])

  async function save(change: Partial<Prefs>) {
    try {
      const p = await call<Prefs>('preferences.set', change)
      setPrefs(p)
      setMonitorBar(p.monitor_bar)
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <Header title="Settings" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <h2 className="mb-2 text-sm font-bold text-dim">Appearance</h2>
        <div className="mb-5">
          <Segments value={prefs?.appearance ?? 'system'} options={THEMES}
            onChange={(appearance) => { setAppearance(appearance); save({ appearance }) }} />
        </div>
        <h2 className="mb-2 text-sm font-bold text-dim">Terminals</h2>
        <Card className="py-1">
          <Switch label="Monitoring bar" hint="CPU, memory and network of the host, under each terminal."
            checked={prefs?.monitor_bar ?? true} onChange={(on) => save({ monitor_bar: on })} />
        </Card>
      </div>
    </div>
  )
}
