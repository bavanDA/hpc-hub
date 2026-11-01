// "Files in scratch are about to be deleted", from each cluster's last check (backup.alerts works them out from the
// cached summary and today's date, so nothing runs on the cluster). One store for the Files banner, the Usage line
// and the notifications; the watcher refreshes it while a cluster is connected.
import { useEffect, useSyncExternalStore } from 'react'

import { call } from '../../rpc'
import type { BackupAlert } from '../../types/backup'
import { useClusters } from '../clusters/store'
import { notify } from '../app/notify'

const EVERY_MS = 30 * 60_000
const FRESH_MS = 5 * 60_000

let alerts: BackupAlert[] = []
let at = 0
let loading: Promise<void> | null = null
const subs = new Set<() => void>()
const told = new Set<string>()

function load(): Promise<void> {
  loading ??= call<BackupAlert[]>('backup.alerts').then((a) => {
    alerts = a
    at = Date.now()
    subs.forEach((f) => f())
  }).catch(() => {}).finally(() => { loading = null })
  return loading
}

function subscribe(f: () => void) {
  subs.add(f)
  return () => { subs.delete(f) }
}

/** The alert for one cluster, or undefined. Loads it when the last answer is old. */
export function useScratchAlert(cluster: string): BackupAlert | undefined {
  const all = useSyncExternalStore(subscribe, () => alerts)
  useEffect(() => {
    if (cluster && Date.now() - at > FRESH_MS) load()
  }, [cluster])
  return all.find((a) => a.cluster === cluster && a.files > 0)
}

/** Mounted once (desktop App, phone PhoneWatch): refreshes while a cluster is connected and notifies new alerts. */
export function useBackupAlertWatch() {
  const { sessions } = useClusters()
  const up = Object.values(sessions).filter((s) => s.connected).map((s) => s.id).sort().join(' ')
  useEffect(() => {
    if (!up) return
    const look = () => load().then(() => {
      for (const a of alerts) {
        const key = `${a.cluster}:${a.files}:${a.soonest_days}`
        if (!a.files || told.has(key)) continue
        told.add(key)
        notify(a.title, a.text, { kind: 'backup', page: 'backup', params: { cluster: a.cluster, step: 'plan' } }).catch(() => {})
      }
    })
    look()
    const t = setInterval(look, EVERY_MS)
    return () => clearInterval(t)
  }, [up])
}
