// An update whose installer couldn't replace the backend program (hpc-hub-backend.exe still running, or Ignore
// pressed at "Error opening file for writing") leaves an older backend next to the new window. Nothing else shows
// it: the app opens, but quick fixes don't install ("a file it shouldn't: fix.json", 2026-11-23) and fixes in the
// backend don't arrive. The backend says which version it was built as (app.version build, core/quickfix.py
// built_as); another one than the window's means installing again.
import { call } from '../../rpc'
import { inTauri } from './platform'

export type AppVersion = { version: string; fix?: number | null; build?: string }

/** What to tell you, or null: the same version, or a backend that doesn't say (not frozen, or older than this). */
export function unfinishedNote(v: AppVersion): string | null {
  if (!v.build || v.build === v.version) return null
  return `The last update didn't finish: part of HPC Hub is still version ${v.build}. Quit HPC Hub, then run its ` +
    'installer again.'
}

export async function unfinishedUpdate(): Promise<string | null> {
  if (!inTauri) return null
  const v = await call<AppVersion>('app.version').catch(() => null)
  return v ? unfinishedNote(v) : null
}
