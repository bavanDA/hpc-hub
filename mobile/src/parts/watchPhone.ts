// The phone's notifications and its stay-connected service, for the whole app (mounted once in App.tsx).
// What to tell you comes from the shared code: Duo and connected (app/notify.ts), node time, jobs that end and
// copies (app/watch.ts), plus agent answers (code/ask.ts). This file decides how: only the kinds you keep on in
// Settings, nothing while you're already looking at the place it's about, and tapping one opens that place.
import { createElement, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { shortName } from '@shared/components/clusters/loginCopy'
import { setNotifier, useSessionNotifications, type Notice, type NoticeKind } from '@shared/components/app/notify'
import { useWatch } from '@shared/components/app/watch'
import type { Page } from '@shared/components/app/pages'
import { useBackupAlertWatch } from '@shared/components/backup/alerts'
import { agentName, isRunning, useAsks } from '@shared/components/code/ask'
import { useClusters } from '@shared/components/clusters/store'
import { placeOf, usePhoneNav, type Place } from '../nav'
import { ConfirmSheet } from '../ui'
import { keepAlive } from './native'

// -- your choices, kept on this phone ----------------------------------------------------------------------------
export const KINDS: [NoticeKind, string][] = [['duo', 'Duo is waiting'], ['connected', 'A cluster connected'],
  ['node', "Your node's time is almost up"], ['job', 'A job ended'], ['copy', 'A copy finished'],
  ['ask', 'An agent answered'], ['backup', 'Scratch files are about to be deleted'], ['backup_done', 'A backup finished']]

export type PhonePrefs = { notify: boolean; kinds: Record<NoticeKind, boolean>; keep: boolean; asked: boolean }

const KEY = 'hpchub.phone'
const OLD_KEEP = 'hpchub.keep-connected'  // before this file: the stay-connected switch alone

function load(): PhonePrefs {
  const kinds = Object.fromEntries(KINDS.map(([k]) => [k, true])) as Record<NoticeKind, boolean>
  const base: PhonePrefs = { notify: true, kinds, keep: false, asked: false }
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<PhonePrefs> | null
    if (saved) return { ...base, ...saved, kinds: { ...kinds, ...saved.kinds } }
    return { ...base, keep: localStorage.getItem(OLD_KEEP) === '1' }
  } catch {
    return base  // private storage: the defaults, for this run
  }
}

let prefs = load()
const subs = new Set<() => void>()

export function usePhonePrefs(): PhonePrefs {
  return useSyncExternalStore((fn) => { subs.add(fn); return () => subs.delete(fn) }, () => prefs)
}

export function setPhonePrefs(change: Partial<PhonePrefs>) {
  prefs = { ...prefs, ...change }
  try { localStorage.setItem(KEY, JSON.stringify(prefs)) } catch { /* kept for this run */ }
  subs.forEach((fn) => fn())
}

// -- Android's permission ----------------------------------------------------------------------------------------
export const EXPLAIN = "Know when Duo is waiting, your node's time is almost up, a job ends or an agent answers. " +
  'Pick which ones in Settings.'

const plugin = () => import('@tauri-apps/plugin-notification')
const inApp = '__TAURI_INTERNALS__' in window

export async function notificationsAllowed(): Promise<boolean> {
  if (!inApp) return new URLSearchParams(location.search).has('allowed')  // design work: ?allowed
  return (await plugin()).isPermissionGranted()
}

/** Asks Android (the system's own dialog). False when you said no; then only Android's app settings can change it. */
export async function askForNotifications(): Promise<boolean> {
  setPhonePrefs({ asked: true })
  if (!inApp) return false
  const n = await plugin()
  if (await n.isPermissionGranted()) return true
  return (await n.requestPermission()) === 'granted'
}

// -- showing one -------------------------------------------------------------------------------------------------
const CHANNEL = 'hpchub'
const RECENT_MS = 3 * 60_000  // the same notice twice in a row (two watchers saw the same thing): once is enough

let channel: Promise<void> | null = null
const recent = new Map<string, number>()
let shownPlace: Place | null = null  // where you are in the app, for "already looking at it"

function lookingAt(about: Notice): boolean {
  if (document.visibilityState !== 'visible' || !document.hasFocus()) return false
  if (about.kind === 'duo') return true  // the Duo screen covers every page
  const there = placeOf(about.page, about.params)
  return !!shownPlace && shownPlace.tab === there.tab && shownPlace.screen === there.screen
}

async function phoneNotify(title: string, body: string, about?: Notice) {
  if (!inApp || !prefs.notify) return
  if (about && (!prefs.kinds[about.kind] || lookingAt(about))) return
  if (!about && document.visibilityState === 'visible' && document.hasFocus()) return
  const key = `${title}\n${body}`
  const now = Date.now()
  if ((recent.get(key) ?? 0) > now - RECENT_MS) return
  recent.set(key, now)
  const n = await plugin()
  if (!(await n.isPermissionGranted())) return  // never asked from the background: the first-time sheet does that
  channel ??= n.createChannel({ id: CHANNEL, name: 'HPC Hub', description: 'Duo, nodes, jobs, copies and agents',
    importance: n.Importance.High }).catch(() => {})
  await channel
  n.sendNotification({ title, body, channelId: CHANNEL, autoCancel: true,
    extra: about ? { page: about.page, params: about.params ?? {} } : {} })
}

// -- the part in the app ----------------------------------------------------------------------------------------
function useAskNotifications() {
  const { asks } = useAsks()
  const was = useRef(new Map<string, boolean>())  // ask id: still running
  useEffect(() => {
    for (const a of asks) {
      const running = isRunning(a)
      if (was.current.get(a.status.id) && !running) {
        const file = a.status.path.split('/').pop() || a.status.path
        const ok = a.status.state === 'done'
        phoneNotify(ok ? `${agentName(a.status.agent)} answered` : `${agentName(a.status.agent)} didn't finish`,
          ok ? file : a.status.detail || file,
          { kind: 'ask', page: 'code', params: { cluster: a.cluster, path: a.status.path, ask: a.status.id } })
          .catch(() => {})
      }
      was.current.set(a.status.id, running)
    }
  }, [asks])
}

/** The stay-connected service: on while you want it and a cluster is connected, naming the clusters. */
function useKeepAlive(keep: boolean) {
  const { clusters, sessions } = useClusters()
  const names = Object.fromEntries((clusters ?? []).map((c) => [c.id, shortName(c)]))
  const up = Object.values(sessions).filter((s) => s.state !== 'Disconnected' && s.state !== 'Error')
  const connected = up.filter((s) => s.connected).map((s) => names[s.id] ?? s.id)
  const list = (connected.length ? connected : up.map((s) => names[s.id] ?? s.id))
  const text = !up.length ? '' : `${connected.length ? 'Connected to' : 'Connecting to'} ${
    list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0]}`
  const on = keep && !!text
  useEffect(() => {
    if (!inApp) return
    keepAlive(on, text || undefined).catch(() => {})  // Settings shows the error when you turn it on
  }, [on, text])
}

/** Mount once, inside the nav provider. Shows the first-time question about notifications, too. */
export function PhoneWatch() {
  const { place, go } = usePhoneNav()
  const p = usePhonePrefs()
  const { sessions } = useClusters()
  const [explain, setExplain] = useState(false)
  shownPlace = place

  useEffect(() => {
    setNotifier(phoneNotify)
    return () => setNotifier(null)
  }, [])
  useSessionNotifications()
  useWatch()  // node time, jobs and copies, wherever you are in the app
  useAskNotifications()
  useBackupAlertWatch()  // scratch files about to be deleted (the last check's numbers)
  useKeepAlive(p.keep)

  // tapping a notification: the place it's about
  useEffect(() => {
    if (!inApp) return
    let stop: (() => void) | undefined
    plugin().then((n) => n.onAction((e) => {
      const extra = e.notification?.extra as { page?: string; params?: Record<string, string> } | undefined
      if (extra?.page) go(extra.page as Page, extra.params ?? {})
    })).then((l) => { stop = () => l.unregister() }).catch(() => {})
    return () => stop?.()
  }, [go])

  // the first time a cluster connects, ask once (with words first, then Android's own dialog)
  const anyUp = Object.values(sessions).some((s) => s.connected)
  useEffect(() => {
    if (!anyUp || !p.notify || p.asked || !inApp) return
    notificationsAllowed().then((ok) => { if (ok) setPhonePrefs({ asked: true }); else setExplain(true) })
      .catch(() => {})
  }, [anyUp, p.notify, p.asked])

  if (!explain) return null
  return createElement(ConfirmSheet, {
    title: 'Get notifications?', text: EXPLAIN, keep: 'Not now', confirm: 'Allow',
    onConfirm: () => { askForNotifications().catch(() => {}) },
    onClose: () => { setExplain(false); setPhonePrefs({ asked: true }) },
  })
}
