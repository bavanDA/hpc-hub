// Desktop notifications while the window is in the background (hpc_hub/app.py _notify): Duo is waiting, or a
// cluster just connected. watch.ts adds node time, jobs that end and finished copies. The phone shows them its
// own way (mobile/src/parts/watchPhone.ts, through setNotifier).
import { useEffect, useRef } from 'react'

import { useEvent } from '../../hooks'
import { call } from '../../rpc'
import type { Cluster, Session } from '../../types'
import { inTauri } from './platform'

export type NoticeKind = 'duo' | 'connected' | 'node' | 'job' | 'copy' | 'ask'
/** What a notification is about: its kind (the phone lets you turn kinds off) and the page tapping it opens. */
export type Notice = { kind: NoticeKind; page: string; params?: Record<string, string> }
type Notifier = (title: string, body: string, about?: Notice) => Promise<void>

let allowed: Promise<boolean> | null = null
let custom: Notifier | null = null

/** Another way to show notifications (the phone's); null puts the desktop's back. */
export function setNotifier(fn: Notifier | null) {
  custom = fn
}

export async function notify(title: string, body: string, about?: Notice) {
  if (custom) return custom(title, body, about)
  if (!inTauri || document.hasFocus()) return
  const n = await import('@tauri-apps/plugin-notification')
  allowed ??= n.isPermissionGranted().then((ok) => ok || n.requestPermission().then((p) => p === 'granted'))
  if (await allowed) n.sendNotification({ title, body })
}

export function useSessionNotifications() {
  const names = useRef<Record<string, string>>({})
  const states = useRef<Record<string, string>>({})
  useEffect(() => {
    call<Cluster[]>('clusters.list').then((cs) => { names.current = Object.fromEntries(cs.map((c) => [c.id, c.name])) })
      .catch(() => {})
    call<Session[]>('sessions.list').then((ss) => ss.forEach((s) => { states.current[s.id] ??= s.state }))
      .catch(() => {})
  }, [])
  useEvent<Session>('session', (s) => {
    const was = states.current[s.id]
    states.current[s.id] = s.state
    if (was === s.state) return
    const name = names.current[s.id] ?? s.id
    if (s.state === 'Approve Duo on your phone') {
      notify(`${name}: approve Duo`, s.detail ?? '', { kind: 'duo', page: 'clusters', params: { cluster: s.id } })
        .catch(() => {})
    } else if (s.state === 'Connected' && was) {
      notify(`${name} connected`, s.node ? `Node ${s.node}, job ${s.job}` : s.detail || 'Logged in',
        { kind: 'connected', page: 'clusters', params: { cluster: s.id } }).catch(() => {})
    }
  })
}
