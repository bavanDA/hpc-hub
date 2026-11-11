import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { GitStatus, Project, ProjectCluster } from '../../types/projects'
import type { Listing } from '../../types/terminals'
import { inside } from '../code/desktop/paths'

const TERMINALS_MS = 15_000
const GIT_MS = 60_000

export type Live = { running: (p: Project) => number; git: (p: Project) => GitStatus[string] | undefined }

/** How many terminal folders are in any of these folders. */
export const countInside = (terminals: string[], folders: string[]) =>
  terminals.filter((t) => folders.some((f) => inside(t, f))).length

/** fn every ms while the window is shown, and at once when key changes (fn is the one of that moment). */
function useEvery(ms: number, key: string, fn: () => void) {
  useEffect(() => {
    fn()
    const t = setInterval(() => document.visibilityState === 'visible' && fn(), ms)
    return () => clearInterval(t)
  }, [ms, key])  // eslint-disable-line react-hooks/exhaustive-deps
}

export function useLive(clusters: ProjectCluster[], projects: Project[]): Live {
  const ids = clusters.filter((c) => c.connected).map((c) => c.id)
  const [paths, setPaths] = useState<Record<string, string[]>>({})  // cluster -> its terminals' folders
  const [git, setGit] = useState<Record<string, GitStatus>>({})
  const [real, setReal] = useState<Record<string, string>>({})  // a project's folder with links followed, as tmux reports it
  const realKey = (p: Project) => `${p.cluster}:${p.path}`

  const terminals = () => ids.forEach((id) => call<Listing>('terminals.list', { cluster: id })
    .then((l) => setPaths((all) => ({ ...all, [id]: l.sessions.map((s) => s.path).filter(Boolean) })))
    .catch(() => {}))
  const status = () => ids.forEach((id) => call<GitStatus>('projects.status', { cluster: id })
    .then((g) => setGit((all) => ({ ...all, [id]: g })))
    .catch(() => {}))

  const links = `${ids.join(' ')}|${projects.map(realKey).join(' ')}`
  useEffect(() => {
    projects.filter((p) => ids.includes(p.cluster)).forEach((p) => call<string>('files.real_path', { cluster: p.cluster, path: p.path })
      .then((path) => setReal((all) => ({ ...all, [realKey(p)]: path }))).catch(() => {}))
  }, [links])  // eslint-disable-line react-hooks/exhaustive-deps

  useEvery(TERMINALS_MS, ids.join(' '), terminals)
  // a project added or moved gets its git at once
  useEvery(GIT_MS, `${ids.join(' ')}|${projects.map((p) => p.id).join(' ')}`, status)

  const on = (p: Project) => ids.includes(p.cluster)
  return {
    running: (p) => on(p) ? countInside(paths[p.cluster] ?? [], [p.path, real[realKey(p)]].filter(Boolean)) : 0,
    git: (p) => on(p) ? git[p.cluster]?.[p.path] : undefined,
  }
}

/** All of it in one line for the phone's rows: "2 running · main · 3 changed", "" when there is nothing. */
export function liveLine(live: Live, p: Project) {
  const n = live.running(p), g = live.git(p)
  return [n > 0 && `${n} running`, g?.branch, g && g.changed > 0 && `${g.changed} changed`].filter(Boolean).join(' · ')
}
