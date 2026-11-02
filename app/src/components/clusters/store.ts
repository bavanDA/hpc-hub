// Live state of every cluster, kept outside the page so it survives switching pages: clusters, sessions
// (sessions.list, then "session" events) and each card's log (clusters.log, then "log" events).
import { useSyncExternalStore } from 'react'

import { call, on } from '../../rpc'
import type { Cluster, Session } from '../../types/clusters'
import { rememberShort } from './loginCopy'

const MAX_LOG = 1000
const inTauri = '__TAURI_INTERNALS__' in window

type Snapshot = {
  clusters: Cluster[] | null
  sessions: Record<string, Session>
  logs: Record<string, string[]>
  error: string
  ready: boolean  // sessions are in: until then "not connected" would only flash
}

let snap: Snapshot = { clusters: null, sessions: {}, logs: {}, error: '', ready: false }
const subs = new Set<() => void>()

function set(change: Partial<Snapshot>) {
  snap = { ...snap, ...change }
  subs.forEach((fn) => fn())
}

function addLog(id: string, lines: string[], before = false) {
  const now = snap.logs[id] ?? []
  set({ logs: { ...snap.logs, [id]: (before ? [...lines, ...now] : [...now, ...lines]).slice(-MAX_LOG) } })
}

const clock = () => new Date().toLocaleTimeString('en-GB', { hour12: false })

const stop = [
  on('session', (d) => set({ sessions: { ...snap.sessions, [(d as Session).id]: d as Session } })),
  on('log', (d) => {
    const { id, line } = d as { id: string; line: string }
    addLog(id, [`${clock()}  ${line}`])
  }),
]
import.meta.hot?.dispose(() => stop.forEach((fn) => fn()))

export function refreshSessions() {
  call<Session[]>('sessions.list')
    .then((all) => set({ sessions: Object.fromEntries(all.map((s) => [s.id, s])), ready: true }))
    .catch(() => set({ ready: true }))
}

let loaded = false

/** Load once; later calls do nothing (events keep it current). */
export function load() {
  if (loaded) return
  loaded = true
  call<Cluster[]>('clusters.list')
    .then((clusters) => {
      rememberShort(clusters)
      set({ clusters, error: '' })
      for (const c of clusters) {
        call<string[]>('clusters.log', { cluster: c.id }).then((lines) => addLog(c.id, lines, true)).catch(() => {})
      }
    })
    .catch((e: Error) => { loaded = false; set({ error: e.message }) })
  refreshSessions()
  // a plain browser has no events: poll the demo data so the page still moves
  if (!inTauri) {
    setInterval(() => {
      refreshSessions()
      for (const c of snap.clusters ?? []) {
        call<string[]>('clusters.log', { cluster: c.id })
          .then((lines) => set({ logs: { ...snap.logs, [c.id]: lines } })).catch(() => {})
      }
    }, 700)
  }
}

/** Put back a cluster the backend changed (clusters.update answers with it). */
export function putCluster(c: Cluster) {
  set({ clusters: (snap.clusters ?? []).map((x) => (x.id === c.id ? c : x)) })
}

export function useClusters(): Snapshot {
  return useSyncExternalStore((fn) => { subs.add(fn); return () => subs.delete(fn) }, () => snap)
}
