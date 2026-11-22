// New versions of HPC Hub, from the GitHub release the app was signed for (tauri-plugin-updater, the key's public
// half is in tauri.conf.json). Checked a little after the start and twice a day (every minute with Beta updates on); installing is one click: download,
// stop the backend (Windows can't replace a running program), install, restart. Work on the cluster keeps running.
// Quick fixes for this very version (quickFix below) every minute; with Beta updates on, betas too. Installed the same way.
// While the window is hidden those quiet checks slow to every 15 minutes (quietChecks.ts).
// In a plain browser (design work), ?update=0.9.0 pretends that version is out.
import { invoke } from '@tauri-apps/api/core'
import { useSyncExternalStore } from 'react'

import { call } from '../../rpc'
import { inTauri } from './platform'
import { quietChecks, SHOWN_EVERY_MS } from './quietChecks'
import { gone, newer, replaces } from './versions'

export type UpdateState =
  | { kind: 'idle' | 'checking' | 'none' }
  | { kind: 'available'; version: string; notes: string }
  | { kind: 'downloading'; version: string; notes: string; done: number; total: number }
  | { kind: 'installing'; version: string; notes: string }
  | { kind: 'error'; text: string; version?: string; notes?: string }

export const RELEASES = 'https://github.com/bavanDA/hpc-hub/releases/latest'
const FIRST_CHECK_MS = 20_000
const EVERY_MS = 12 * 3600_000

type Found = { version: string; body?: string
  download: (onEvent: (e: DownloadEvent) => void) => Promise<void>
  install: () => Promise<void>; close?: () => Promise<void> }
type DownloadEvent = { event: 'Started'; data: { contentLength?: number } } | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished' }

let state: UpdateState = { kind: 'idle' }
let found: Found | null = null
const listeners = new Set<() => void>()

export const getUpdate = () => state
export function onUpdate(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } }
function set(next: UpdateState) { state = next; listeners.forEach((fn) => fn()) }
export const useUpdateState = () => useSyncExternalStore(onUpdate, getUpdate)

let opener: (() => void) | null = null
/** The update window's way in (UpdateChecker); openUpdateDialog() opens it from anywhere. */
export const setOpener = (fn: (() => void) | null) => { opener = fn }
export const openUpdateDialog = () => opener?.()

const demoVersion = () => inTauri ? null : new URLSearchParams(location.search).get('update')

/** The update the browser demo pretends to have: a download that takes about three seconds. */
function demoUpdate(version: string): Found {
  return {
    version, body: 'Fixes for VS Code and the terminal. The app updates itself from now on.',
    download: async (onEvent) => {
      const total = 80_000_000
      onEvent({ event: 'Started', data: { contentLength: total } })
      for (let got = 0; got < total; got += 4_000_000) {
        await new Promise((r) => setTimeout(r, 150))
        onEvent({ event: 'Progress', data: { chunkLength: 4_000_000 } })
      }
      onEvent({ event: 'Finished' })
    },
    install: async () => { await new Promise((r) => setTimeout(r, 800)); location.reload() },
  }
}

/** Ask GitHub whether there is a newer version. */
export async function checkUpdates(): Promise<UpdateState> {
  if (state.kind === 'downloading' || state.kind === 'installing') return state
  set({ kind: 'checking' })
  try {
    const demo = demoVersion()
    if (demo) found = demoUpdate(demo)
    else if (!inTauri) found = null
    else found = await newest()
    set(found ? { kind: 'available', version: found.version, notes: found.body ?? '' } : { kind: 'none' })
  } catch (e) {
    set({ kind: 'error', text: `Could not check for updates: ${message(e)}` })
  }
  return state
}

/** The normal release, and with Beta updates on the beta too: whichever is newer. A beta that can't be read (none
 * yet, or none for this system) is no update; the normal check's errors are the ones shown. With neither, a quick
 * fix for this very version (a beta or a release). */
async function newest(): Promise<Found | null> {
  const { check, Update } = await import('@tauri-apps/plugin-updater')
  const beta = await betaOn()
  const [normal, ahead, fix] = await Promise.all([
    check(),
    beta ? invoke<ConstructorParameters<typeof Update>[0] | null>('check_beta_update')
      .then((m) => (m ? new Update(m) : null)).catch(() => null) : Promise.resolve(null),
    quickFix().catch(() => null),  // a beta's or a release's, Beta updates on or not
  ])
  const pick = !ahead ? normal : !normal ? ahead : newer(ahead.version, normal.version) ? ahead : normal
  for (const other of [normal, ahead]) if (other && other !== pick) void other.close().catch(() => {})
  return (pick as unknown as Found | null) ?? fix
}

type QuickFixState = { version: string; running: number | null; offered: { number: number; notes: string } | null }

/** Quick fixes (hpc_hub/core/quickfix.py): the screens and the backend's Python for this version, about a minute
 * after a fix is made. Installing downloads it; the restart puts it to use. */
async function quickFix(): Promise<Found | null> {
  const q = await call<QuickFixState>('updates.quick_fix')
  if (!q.offered) return null
  return {
    version: `${q.version} fix ${q.offered.number}`, body: q.offered.notes,
    download: async (onEvent) => {
      onEvent({ event: 'Started', data: {} })
      await call('updates.quick_fix_install')
      onEvent({ event: 'Finished' })
    },
    install: async () => {},
    close: async () => {},
  }
}

/** Download, then stop the backend, install and restart. Progress and errors go to the state. An offer whose files
 * are gone is looked up again and the newest is installed instead. */
export async function installUpdate(): Promise<void> {
  if (!found || state.kind !== 'available' && state.kind !== 'error') return
  let { version, body = '' } = found
  let stopped = false  // the backend: once it's down, a failed install has to restart the app
  try {
    const get = async (f: Found) => {
      let total = 0, done = 0
      set({ kind: 'downloading', version, notes: body, done, total })
      await f.download((e) => {
        if (e.event === 'Started') total = e.data.contentLength ?? 0
        else if (e.event === 'Progress') done += e.data.chunkLength
        set({ kind: 'downloading', version, notes: body, done, total })
      })
    }
    try {
      await get(found)
    } catch (e) {
      if (!gone(e) || !inTauri) throw e
      const fresh = await newest()
      if (!fresh || fresh.version === version) throw e
      void found.close?.().catch(() => {})
      found = fresh
      ;({ version, body = '' } = fresh)
      await get(fresh)
    }
    set({ kind: 'installing', version, notes: body })
    if (inTauri) { await invoke('update_ready'); stopped = true }  // nothing is lost on the cluster
    await found.install()  // on Windows the installer takes over and the app closes here
    if (inTauri) {
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    }
  } catch (e) {
    const again = stopped ? ' HPC Hub restarts in a few seconds.' : ''
    set({ kind: 'error', version, notes: body, text: `The update didn't install: ${message(e)}.${again}` })
    if (stopped) setTimeout(() => { void import('@tauri-apps/plugin-process').then((p) => p.relaunch()) }, 5000)
  }
}

function message(e: unknown) {
  const text = e instanceof Error ? e.message : String(e)
  return text || 'no answer from GitHub'
}

let started = false
/** Checks a little after the app starts, then twice a day. found: called once per new version. */
export function startUpdateChecks(found: (version: string) => void) {
  if (started) return
  started = true
  let told = ''
  const look = () => checkUpdates().then((s) => {
    if (s.kind === 'available' && s.version !== told) { told = s.version; found(s.version) }
  })
  setTimeout(look, demoVersion() ? 1500 : FIRST_CHECK_MS)
  setInterval(look, EVERY_MS)
  if (!inTauri) return
  // the window is up: a quick fix in use is good enough to keep (quickfix.rs drops one whose start never got here)
  void call('app.version').then(() => invoke('quick_fix_started')).catch(() => {})
  // every minute, quietly: a quick fix for this version; with Beta updates on also a new beta and a release (three
  // small files) (no "Checking…"); an update already offered or installing is left alone
  // An offer is looked at again too: a newer beta replaces the files of the one offered, so that one can't install.
  // Hidden, every 15 minutes instead, and once right away when the window shows again (quietChecks.ts).
  const quiet = () => state.kind === 'idle' || state.kind === 'none' || state.kind === 'available'
    || state.kind === 'error' && !state.version
  const checks = quietChecks(() => {
    if (!quiet()) return
    void betaOn().then(async (on) => {
      const f = on ? await newest() : await quickFix()  // Beta updates off: only a quick fix, one small file
      if (!f || !quiet() || state.kind === 'available' && !replaces(f.version, state.version)) {
        void f?.close?.().catch(() => {})
        return
      }
      setFound(f)
      if (f.version !== told) { told = f.version; found(f.version) }
    }).catch(() => {})
  }, () => Date.now(), () => document.hidden)
  setInterval(checks.tick, SHOWN_EVERY_MS)
  document.addEventListener('visibilitychange', checks.shown)
}

const betaOn = () => call<{ beta_updates: boolean }>('preferences.get').then((p) => p.beta_updates).catch(() => false)

function setFound(f: Found) {
  if (found && found !== f) void found.close?.().catch(() => {})  // the offer it replaces
  found = f
  set({ kind: 'available', version: f.version, notes: f.body ?? '' })
}
