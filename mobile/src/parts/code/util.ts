// Small helpers for the phone's Code tab: recently opened files, logs and the error lines in them, the command that
// runs a file in a terminal, and the editor's languages kept once loaded (the diff of an ask uses them too).
import type { Extension } from '@codemirror/state'

import { detect, loadLanguage, type LangId } from '@shared/components/code/languages'

// -- recent files ------------------------------------------------------------------------------------------------
export type Recent = { cluster: string; path: string; at: number }
const RECENT = 'hpc-hub-code-recent'
const KEEP = 12

export function recentFiles(): Recent[] {
  try { return JSON.parse(localStorage.getItem(RECENT) ?? '[]') as Recent[] } catch { return [] }
}

export function rememberFile(cluster: string, path: string) {
  const list = [{ cluster, path, at: Date.now() },
    ...recentFiles().filter((r) => r.cluster !== cluster || r.path !== path)].slice(0, KEEP)
  try { localStorage.setItem(RECENT, JSON.stringify(list)) } catch { /* private window */ }
}

// -- paths -------------------------------------------------------------------------------------------------------
export const nameOf = (path: string) => path.replace(/\/+$/, '').split('/').pop() || path
export const folderOf = (path: string) => path.replace(/\/[^/]*$/, '') || '/'

function resolve(dir: string, path: string): string {
  if (path.startsWith('/') || path.startsWith('~')) return path
  const parts = dir.split('/')
  for (const p of path.split('/')) {
    if (p === '..') parts.pop()
    else if (p !== '.' && p) parts.push(p)
  }
  return parts.join('/') || '/'
}

// -- logs --------------------------------------------------------------------------------------------------------
/** Job output and logs open at their end, read-only, with Follow. */
export const isLog = (path: string) => /\.(out|err|log)$/i.test(path) || /\/slurm-\d+(_\d+)?\.(out|err)$/.test(path)

/** A place in a file that an error line points at. */
export type Spot = { path: string; line: number }

const PYTHON = /File "([^"]+)", line (\d+)/
const COMPILER = /((?:\/|\.{1,2}\/|~\/)?[\w./~+-]+\.(?:py|c|cc|cpp|cxx|h|hpp|cu|f|f90|f95|f03|jl|r|R|m|sh|tex)):(\d+)(?::\d+)?/

/** Where a log line points (a Python traceback line, "file.c:12:5: error"), or null. dir is the log's folder. */
export function spotIn(line: string, dir: string): Spot | null {
  const py = PYTHON.exec(line)
  if (py) return { path: resolve(dir, py[1]), line: Number(py[2]) }
  const c = COMPILER.exec(line)
  if (c) return { path: resolve(dir, c[1]), line: Number(c[2]) }
  return null
}

const ERROR = /Traceback \(most recent call last\)|\b(\w*Error|Exception|Segmentation fault|error:|FAILED|Killed|CANCELLED|OUT_OF_MEMORY|oom-kill)\b/

/** The error at the end of a log: the last traceback, else the last lines that look like an error. '' for none. */
export function lastError(text: string): string {
  const lines = text.split('\n')
  const tb = lines.map((l) => l.startsWith('Traceback (most recent call last)')).lastIndexOf(true)
  if (tb >= 0) return lines.slice(tb).join('\n').trim()
  const hit = lines.map((l) => ERROR.test(l)).lastIndexOf(true)
  if (hit < 0) return ''
  return lines.slice(Math.max(0, hit - 15), hit + 5).join('\n').trim()
}

/** The user's own file an error points at last (not a library's), for "Fix this error". */
export function blamed(error: string, dir: string): Spot | null {
  const spots = error.split('\n').map((l) => spotIn(l, dir)).filter((s): s is Spot => !!s)
  const mine = spots.filter((s) => !/site-packages|dist-packages|\/lib\/python|\/usr\/lib|\/opt\//.test(s.path))
  return mine[mine.length - 1] ?? spots[spots.length - 1] ?? null
}

// -- running a file ----------------------------------------------------------------------------------------------
const RUN: Partial<Record<LangId, (file: string) => string>> = {
  python: (f) => `python ${f}`, shell: (f) => `bash ${f}`, slurm: (f) => `bash ${f}`, r: (f) => `Rscript ${f}`,
  julia: (f) => `julia ${f}`, matlab: (f) => `matlab -batch "run('${f}')"`,
}

/** The command that runs this file from its folder, or '' when it isn't something to run. */
export function runCommand(path: string, text: string): string {
  const fn = RUN[detect(path, text).id]
  const file = `'${nameOf(path).replace(/'/g, "'\\''")}'`
  return fn ? fn(file) : ''
}

// -- languages, kept once loaded ---------------------------------------------------------------------------------
const loaded = new Map<LangId, Extension>()

/** Loads a file's language so the diffs of an ask can use it right away. */
export function preloadLanguage(path: string) {
  const id = detect(path).id
  if (loaded.has(id)) return
  loadLanguage(id).then((ext) => loaded.set(id, ext)).catch(() => {})
}

const extensions = new Map<string, Extension[]>()

/** The language for a path as a stable array (Diff wants the same array each time); [] until it has loaded. */
export function languageFor(path: string): Extension[] {
  const id = detect(path).id
  const ext = loaded.get(id)
  if (!ext) return []
  const key = id
  if (!extensions.has(key)) extensions.set(key, [ext])
  return extensions.get(key)!
}

/** "train.py:40-58" or "train.py:40", for pasting into a chat. */
export function reference(path: string, from: number, to: number) {
  return `${path}:${from}${to > from ? `-${to}` : ''}`
}
