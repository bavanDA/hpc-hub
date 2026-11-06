import type { LatexProject, Paper } from '../../../types/latex'

/** What to open for a project: its main .tex when known, else its folder. */
export const openPath = (p: { path: string; main_tex: string }) => p.main_tex ? `${p.path}/${p.main_tex}` : p.path

export const matchProjects = (projects: LatexProject[], filter: string) => {
  const f = filter.trim().toLowerCase()
  return projects.filter((p) => !f || `${p.name} ${p.path}`.toLowerCase().includes(f))
}

export const matchPapers = (papers: Paper[], filter: string) => {
  const f = filter.trim().toLowerCase()
  return papers.filter((p) => !f || `${p.title} ${p.folder}`.toLowerCase().includes(f))
}

/** A new search's results replace those of the clusters it reached; newest first. */
export function mergeFound(papers: Paper[], fresh: (readonly [string, Paper[]])[]): Paper[] {
  const ids = new Set(fresh.map(([id]) => id))
  return [...papers.filter((p) => !ids.has(p.cluster)), ...fresh.flatMap(([, l]) => l)].sort((a, b) => b.mtime - a.mtime)
}
