import { isDirty, openFiles, subscribe, type OpenFile } from './store'

/** Unsaved edits kept in IndexedDB, with the sha they started from. Without storage there are simply none. */
export type Draft = { cluster: string; path: string; base_sha: string; text: string; at: number }

const DB = 'hpc-hub-code'
const STORE = 'drafts'
const EVERY = 1000  // ms between two writes of the same file while it has unsaved edits

const draftKey = (cluster: string, path: string) => `${cluster}\n${path}`

let db: Promise<IDBDatabase | null> | null = null

function open(): Promise<IDBDatabase | null> {
  if (!db) {
    db = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB, 1)
        req.onupgradeneeded = () => req.result.createObjectStore(STORE)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(null)
        req.onblocked = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
  }
  return db
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const d = await open()
  if (!d) return null
  return new Promise((resolve) => {
    try {
      const req = fn(d.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function findDraft(cluster: string, path: string): Promise<Draft | null> {
  return (await run<Draft | undefined>('readonly', (s) => s.get(draftKey(cluster, path)))) ?? null
}

async function saveDraft(f: Pick<OpenFile, 'cluster' | 'path' | 'sha' | 'text'>): Promise<void> {
  const draft: Draft = { cluster: f.cluster, path: f.path, base_sha: f.sha, text: f.text, at: Date.now() }
  await run('readwrite', (s) => s.put(draft, draftKey(f.cluster, f.path)))
}

/** Forgets the draft: after saving, after "Discard", or when the edits were undone. */
export async function discardDraft(cluster: string, path: string): Promise<void> {
  await run('readwrite', (s) => s.delete(draftKey(cluster, path)))
}

/** Every draft kept, newest first: for "Restore your edits" on the Code tab's start. */
export async function allDrafts(): Promise<Draft[]> {
  const all = (await run<Draft[]>('readonly', (s) => s.getAll())) ?? []
  return all.sort((a, b) => b.at - a.at)
}

/** Keeps a draft of every open file with unsaved edits, at most once a second each, and drops it once the file
 * is saved or its edits are undone. Call once; returns a function that stops it. */
export function keepDrafts(): () => void {
  const last = new Map<string, { text: string; at: number }>()  // what was written for each file, and when
  const timers = new Map<string, number>()

  function write(key: string) {
    timers.delete(key)
    const f = openFiles().find((x) => x.key === key)
    if (!f) return
    if (!isDirty(f)) {
      if (last.has(key)) void discardDraft(f.cluster, f.path)
      last.delete(key)
      return
    }
    if (last.get(key)?.text === f.text) return
    last.set(key, { text: f.text, at: Date.now() })
    void saveDraft(f)
  }

  function check() {
    const now = Date.now()
    const keys = new Set(openFiles().map((f) => f.key))
    for (const f of openFiles()) {
      const was = last.get(f.key)
      const needs = isDirty(f) ? was?.text !== f.text : was !== undefined
      if (!needs || timers.has(f.key)) continue
      const wait = Math.max(0, EVERY - (now - (was?.at ?? 0)))
      timers.set(f.key, window.setTimeout(() => write(f.key), wait))
    }
    for (const key of [...last.keys()]) if (!keys.has(key)) last.delete(key)  // closed: the shell decides
  }

  const stop = subscribe(check)
  return () => {
    stop()
    timers.forEach((t) => clearTimeout(t))
    timers.clear()
  }
}
