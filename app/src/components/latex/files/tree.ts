import type { TreeEntry } from '../../../types/latex'
import { basename, dirname } from '../bits'

export type Node = { path: string; name: string; dir: boolean; children: Node[] }

/** Folders first, then files, by name, at every level. */
export function buildTree(entries: TreeEntry[]): Node[] {
  const root: Node[] = []
  const dirs = new Map<string, Node>()
  const sorted = [...entries].sort((a, b) => a.path.split('/').length - b.path.split('/').length ||
    (a.kind === b.kind ? a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }) : a.kind === 'd' ? -1 : 1))
  for (const e of sorted) {
    const node: Node = { path: e.path, name: basename(e.path), dir: e.kind === 'd', children: [] }
    if (node.dir) dirs.set(e.path, node)
    const parent = e.path.includes('/') ? dirs.get(dirname(e.path)) : undefined
    ;(parent ? parent.children : root).push(node)
  }
  return root
}

/** The folder a relative path sits in; "" is the project's top folder. */
export const folderOf = (rel: string) => rel.includes('/') ? dirname(rel) : ''

/** Where new files go for a picked entry: into it when it is a folder, else next to it. */
export const targetFolder = (rel: string, dir: boolean) => dir ? rel : folderOf(rel)

/** Moving into itself, into its own subfolder or where it already is does nothing. */
export const canMove = (rel: string, into: string) =>
  !!rel && rel !== into && !into.startsWith(rel + '/') && folderOf(rel) !== into

/** The folders holding a file, outermost first: "a/b/c.tex" gives "a" and "a/b". */
export function foldersAbove(rel: string): string[] {
  const parts = rel.split('/').slice(0, -1)
  return parts.map((_, i) => parts.slice(0, i + 1).join('/'))
}
