// New versions of HPC Hub, from the GitHub release the app was signed for (tauri-plugin-updater, the key's public
// half is in tauri.conf.json). Checked a little after the start and twice a day; installing is one click: download,
// stop the backend (Windows can't replace a running program), install, restart. Work on the cluster keeps running.
// In a plain browser (design work), ?update=0.9.0 pretends that version is out.
import { invoke } from '@tauri-apps/api/core'
import { useSyncExternalStore } from 'react'

import { inTauri } from './platform'

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
  install: () => Promise<void> }
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
    else {
      const { check } = await import('@tauri-apps/plugin-updater')
      found = await check() as unknown as Found | null
    }
    set(found ? { kind: 'available', version: found.version, notes: found.body ?? '' } : { kind: 'none' })
  } catch (e) {
    set({ kind: 'error', text: `Could not check for updates: ${message(e)}` })
  }
  return state
}

/** Download, then stop the backend, install and restart. Progress and errors go to the state. */
export async function installUpdate(): Promise<void> {
  if (!found || state.kind !== 'available' && state.kind !== 'error') return
  const { version, body = '' } = found
  try {
    let total = 0, done = 0
    set({ kind: 'downloading', version, notes: body, done, total })
    await found.download((e) => {
      if (e.event === 'Started') total = e.data.contentLength ?? 0
      else if (e.event === 'Progress') done += e.data.chunkLength
      set({ kind: 'downloading', version, notes: body, done, total })
    })
    set({ kind: 'installing', version, notes: body })
    if (inTauri) await invoke('update_ready')  // the backend stops; nothing is lost on the cluster
    await found.install()  // on Windows the installer takes over and the app closes here
    if (inTauri) {
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    }
  } catch (e) {
    set({ kind: 'error', version, notes: body, text: `The update didn't install: ${message(e)}` })
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
}
