import type { CopyTarget, CopyTargets, Place, Project } from '../../types/projects'

export function startFolder(p: Project, info: CopyTargets, dst: CopyTarget | undefined, spots: Place[]): string {
  if (!dst) return '~'
  if (dst.id === info.copy_to && info.copy_into) return info.copy_into
  const mine = (s: Place) => !!p.group && (s.label.endsWith(`(${p.group})`) || `${s.path}/`.includes(`/${p.group}/`))
  const project = spots.filter((s) => s.label.startsWith('Project'))
  return (dst.same ? project.find((s) => !mine(s)) : undefined)?.path ?? project[0]?.path ?? '~'
}

export const inside = (into: string, path: string) => into === path || into.startsWith(path.replace(/\/+$/, '') + '/')

/** The storage place a folder is in: the deepest one that holds it. */
export const spotFor = (into: string, spots: Place[]): Place | undefined =>
  spots.filter((s) => inside(into, s.path)).sort((a, b) => b.path.length - a.path.length)[0]
