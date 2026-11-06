import { useSyncExternalStore } from 'react'

import { call } from '../../rpc'
import type { OpenedFile, SaveResult } from '../../types/code'

const MAX_OPEN = 10

export type Cursor = { line: number; col: number }  // 1-based line, 0-based column

export type OpenFile = {
  key: string             // "<cluster>:<path>"
  cluster: string
  path: string
  name: string            // the last part of the path
  text: string            // what the editor shows now
  saved: string           // the text as it was opened or last saved; text !== saved means unsaved edits
  sha: string             // of the bytes on the cluster that `saved` came from
  mtime: number
  size: number
  eol: OpenedFile['eol']
  writable: boolean
  readonlyReason: string  // '' when it can be edited
  lossy: boolean
  editing: boolean        // view mode until you tap Edit, so scrolling never opens the keyboard
  cursor: Cursor
  loading: boolean
  error: string
  version: number         // goes up when the text changes from outside the editor (reload, accepted proposal)
}

type SaveOutcome =
  | { saved: true }
  | { saved: false; conflict: true; sha: string; mtime: number }
  | { saved: false; conflict: false; error: string }

type State = { files: OpenFile[]; current: string | null }

/** The open files, outside React so they stay open on other pages; the phone and the desktop share them. */
let state: State = { files: [], current: null }
const subscribers = new Set<() => void>()

function changed(next: Partial<State>) {
  state = { ...state, ...next }
  subscribers.forEach((fn) => fn())
}

function patch(key: string, change: Partial<OpenFile>) {
  changed({ files: state.files.map((f) => (f.key === key ? { ...f, ...change } : f)) })
}

export const fileKey = (cluster: string, path: string) => `${cluster}:${path}`
export const isDirty = (f: OpenFile) => f.text !== f.saved
export const getFile = (key: string) => state.files.find((f) => f.key === key)
export const openFiles = () => state.files

export function useCode(): State {
  return useSyncExternalStore((fn) => { subscribers.add(fn); return () => subscribers.delete(fn) }, () => state)
}

/** Calls fn whenever the open files change; for drafts.ts and watch.ts. */
export function subscribe(fn: () => void): () => void {
  subscribers.add(fn)
  return () => { subscribers.delete(fn) }
}

function fromOpened(cluster: string, o: OpenedFile, editing: boolean, cursor: Cursor): Omit<OpenFile, 'version'> {
  const path = o.path
  return {
    key: fileKey(cluster, path), cluster, path, name: path.split('/').pop() || path, text: o.text, saved: o.text,
    sha: o.sha, mtime: o.mtime, size: o.size, eol: o.eol, writable: o.writable && !o.lossy,
    readonlyReason: o.lossy && !o.readonly_reason ? 'Not UTF-8 text' : o.readonly_reason, lossy: o.lossy,
    editing, cursor, loading: false, error: '',
  }
}

/** Opens a file (or shows it when it is open already). line moves the cursor there. */
export async function openFile(cluster: string, path: string, line?: number): Promise<void> {
  const key = fileKey(cluster, path)
  const open = getFile(key)
  if (open) {
    changed({ current: key })
    if (line) patch(key, { cursor: { line, col: 0 }, version: open.version + 1 })
    return
  }
  const placeholder: OpenFile = {
    key, cluster, path, name: path.split('/').pop() || path, text: '', saved: '', sha: '', mtime: 0, size: 0,
    eol: 'lf', writable: false, readonlyReason: '', lossy: false, editing: false,
    cursor: { line: line ?? 1, col: 0 }, loading: true, error: '', version: 0,
  }
  changed({ files: trim([...state.files, placeholder]), current: key })
  try {
    const opened = await call<OpenedFile>('code.open', { cluster, path })
    if (!getFile(key)) return  // closed while loading
    // keep the path you asked for: the key must not change under the shell's feet
    patch(key, { ...fromOpened(cluster, opened, false, placeholder.cursor), key, path, version: 1 })
  } catch (e) {
    patch(key, { loading: false, error: (e as Error).message })
  }
}

/** Keeps at most MAX_OPEN files: the oldest ones without unsaved edits go first. */
function trim(files: OpenFile[]): OpenFile[] {
  const out = [...files]
  while (out.length > MAX_OPEN) {
    const i = out.findIndex((f) => !isDirty(f))
    if (i < 0) break
    out.splice(i, 1)
  }
  return out
}

export function selectFile(key: string | null) {
  changed({ current: key })
}

/** Closes a file. Unsaved edits are dropped, so the shell asks first (isDirty). */
export function closeFile(key: string) {
  const i = state.files.findIndex((f) => f.key === key)
  if (i < 0) return
  const files = state.files.filter((f) => f.key !== key)
  const current = state.current === key ? (files[Math.min(i, files.length - 1)]?.key ?? null) : state.current
  changed({ files, current })
}

export function closeOthers(key: string) {
  changed({ files: state.files.filter((f) => f.key === key || isDirty(f)), current: key })
}

/** The editor reports typing here. */
export function setText(key: string, text: string) {
  const f = getFile(key)
  if (f && f.text !== text) patch(key, { text })
}

export function setCursor(key: string, cursor: Cursor) {
  patch(key, { cursor })
}

/** Switches between view and edit mode; files that can't be saved stay in view mode. */
export function setEditing(key: string, editing: boolean) {
  const f = getFile(key)
  if (f) patch(key, { editing: editing && f.writable })
}

/** Puts text in the editor from outside it (a restored draft, an accepted proposal). It counts as an unsaved edit. */
export function replaceText(key: string, text: string) {
  const f = getFile(key)
  if (f) patch(key, { text, version: f.version + 1 })
}

/** Takes the file as it is on the cluster now. keepEdits false drops unsaved edits; the cursor stays. */
export async function reloadFile(key: string, keepEdits = false): Promise<void> {
  const f = getFile(key)
  if (!f) return
  try {
    const opened = await call<OpenedFile>('code.open', { cluster: f.cluster, path: f.path })
    const now = getFile(key)
    if (!now) return
    const fresh = { ...fromOpened(f.cluster, opened, now.editing, now.cursor), key, path: f.path, name: f.name }
    patch(key, { ...fresh, text: keepEdits && isDirty(now) ? now.text : fresh.text, version: now.version + 1 })
  } catch (e) {
    patch(key, { error: (e as Error).message })
  }
}

/** Saves the editor's text. force writes over a newer file on the cluster (the user chose "Save mine"). */
export async function saveFile(key: string, force = false): Promise<SaveOutcome> {
  const f = getFile(key)
  if (!f) return { saved: false, conflict: false, error: 'This file is not open' }
  if (!f.writable) return { saved: false, conflict: false, error: f.readonlyReason || 'This file is read-only' }
  const text = f.text
  try {
    const r = await call<SaveResult>('code.save',
      { cluster: f.cluster, path: f.path, text, base_sha: f.sha, force })
    if (!r.saved) return { saved: false, conflict: true, sha: r.sha, mtime: r.mtime }
    const now = getFile(key)
    if (now) patch(key, { saved: text, sha: r.sha, mtime: r.mtime, error: '' })
    return { saved: true }
  } catch (e) {
    return { saved: false, conflict: false, error: (e as Error).message }
  }
}

/** Marks the file as matching the cluster after something else wrote it (an undo through code.save). */
export function markSaved(key: string, text: string, sha: string, mtime: number) {
  const f = getFile(key)
  if (f) patch(key, { text, saved: text, sha, mtime, version: f.version + 1 })
}
