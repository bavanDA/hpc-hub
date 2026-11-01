// Notices when open files change on the cluster (an agent, a job, another editor). Every 10 s while the Code page is
// visible, and as soon as the app comes back: a file without unsaved edits reloads quietly and keeps its cursor; a
// file with edits only raises a "changed" event, so nothing you typed is lost. After you send something to an agent,
// the next change to that file is reported as the agent's, with the text from before so it can be undone.
import { call } from '../../rpc'
import type { FileState, SaveResult } from '../../types/code'
import { getFile, isDirty, markSaved, openFiles, reloadFile } from './store'

export const EVERY = 10_000

export type WatchEvent =
  | { kind: 'reloaded'; key: string }                          // clean file, now the cluster's version
  | { kind: 'changed'; key: string; sha: string }              // has your edits; the shell offers Compare / Reload / Keep mine
  | { kind: 'deleted'; key: string }                           // gone from the cluster
  | { kind: 'agent-changed'; key: string; agent: string; before: string }  // after a send; offers Keep / Undo

const listeners = new Set<(e: WatchEvent) => void>()
const reported = new Map<string, string>()  // key -> the cluster's sha already reported as "changed"
const sent = new Map<string, { agent: string; before: string; sha: string }>()

export function onWatch(fn: (e: WatchEvent) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

const emit = (e: WatchEvent) => listeners.forEach((fn) => fn(e))

/** Call right before sending a file to a running agent: its next change is then shown as the agent's. */
export function expectAgentChange(key: string, agent: string) {
  const f = getFile(key)
  if (f) sent.set(key, { agent, before: f.saved, sha: f.sha })
}

/** Puts back the text from before the agent changed the file (Undo). Answers false when the file changed again. */
export async function undoAgentChange(key: string, before: string): Promise<boolean> {
  const f = getFile(key)
  if (!f) return false
  const r = await call<SaveResult>('code.save', { cluster: f.cluster, path: f.path, text: before, base_sha: f.sha })
  if (!r.saved) return false
  markSaved(key, before, r.sha, r.mtime)
  return true
}

let busy = false

/** Looks once at every open file. Safe to call any time; overlapping calls are skipped. */
export async function checkNow(): Promise<void> {
  if (busy) return
  busy = true
  try {
    const byCluster = new Map<string, string[]>()
    for (const f of openFiles()) {
      if (f.loading || f.error) continue
      byCluster.set(f.cluster, [...(byCluster.get(f.cluster) ?? []), f.path])
    }
    await Promise.all([...byCluster].map(async ([cluster, paths]) => {
      let states: FileState[]
      try {
        states = await call<FileState[]>('code.stat', { cluster, paths })
      } catch {
        return  // not connected right now: try again next time
      }
      for (const s of states) await look(`${cluster}:${s.path}`, s)
    }))
  } finally {
    busy = false
  }
}

async function look(key: string, s: FileState) {
  const f = getFile(key)
  if (!f) return
  if (!s.exists) {
    if (reported.get(key) !== 'deleted') emit({ kind: 'deleted', key })
    reported.set(key, 'deleted')
    return
  }
  if (s.sha === f.sha) {
    reported.delete(key)
    return
  }
  const agent = sent.get(key)
  if (!isDirty(f)) {
    await reloadFile(key)
    reported.delete(key)
    if (agent) {
      sent.delete(key)
      emit({ kind: 'agent-changed', key, agent: agent.agent, before: agent.before })
    } else {
      emit({ kind: 'reloaded', key })
    }
    return
  }
  if (reported.get(key) === s.sha) return  // told already; the banner is still up
  reported.set(key, s.sha)
  emit({ kind: 'changed', key, sha: s.sha })
}

/** Starts watching: every EVERY ms while the page is visible, and right away when it becomes visible again.
 * Returns a function that stops it. */
export function startWatch(): () => void {
  let timer: number | null = null
  const tick = () => {
    if (document.visibilityState === 'visible') void checkNow()
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') void checkNow()
  }
  timer = window.setInterval(tick, EVERY)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)
  return () => {
    if (timer !== null) clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', onVisible)
  }
}
