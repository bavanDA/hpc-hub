// The project's files as a tree, like Overleaf: folders open and close, drag to move, right-click to manage.
import { BookOpen, ChevronRight, File, FilePlus, FileText, Folder, FolderOpen, FolderPlus, Image, RefreshCw }
  from 'lucide-react'
import { useMemo, useState, type DragEvent } from 'react'

import type { TreeEntry } from '../../types/latex'
import { ContextMenu, type MenuItem } from '../files/ContextMenu'
import { basename, dirname, ext, IMAGE_EXT } from './bits'

type Node = { path: string; name: string; dir: boolean; children: Node[] }

function build(entries: TreeEntry[]): Node[] {
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

function Icon({ node, open }: { node: Node; open: boolean }) {
  const x = ext(node.name)
  const cls = 'shrink-0'
  if (node.dir) return open ? <FolderOpen size={16} className={`${cls} text-accent-text`} />
    : <Folder size={16} className={`${cls} text-accent-text`} />
  if (x === '.tex') return <FileText size={16} className={`${cls} text-ok`} />
  if (x === '.bib') return <BookOpen size={16} className={`${cls} text-warn`} />
  if (IMAGE_EXT.includes(x) || x === '.pdf' || x === '.eps') return <Image size={16} className={`${cls} text-dim`} />
  return <File size={16} className={`${cls} text-dim`} />
}

// Open folders by project, kept while you visit other pages
const opened = new Map<string, Set<string>>()

export type TreeActions = {
  open: (rel: string) => void
  move: (rel: string, into: string) => void
  newFile: (into: string) => void
  newFolder: (into: string) => void
  rename: (rel: string) => void
  remove: (rel: string) => void
  setMain: (rel: string) => void
  copyPath: (rel: string) => void
  refresh: () => void
}

export function FileTree({ id, entries, current, main, actions }:
  { id: string; entries: TreeEntry[]; current: string; main: string; actions: TreeActions }) {
  const nodes = useMemo(() => build(entries), [entries])
  const [open, setOpen] = useState<Set<string>>(() => {
    const was = opened.get(id) ?? new Set<string>()
    const parts = current.split('/').slice(0, -1)  // the folders holding the open file
    parts.forEach((_, i) => was.add(parts.slice(0, i + 1).join('/')))
    return was
  })
  const [menu, setMenu] = useState<{ x: number; y: number; node: Node | null } | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)

  const toggle = (p: string) => {
    const next = new Set(open)
    if (!next.delete(p)) next.add(p)
    opened.set(id, next)
    setOpen(next)
  }
  const here = (n: Node | null) => n ? (n.dir ? n.path : n.path.includes('/') ? dirname(n.path) : '') : ''

  const drop = (into: string) => (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setOver(null)
    const rel = e.dataTransfer.getData('application/x-latex-path')
    if (rel && rel !== into && !into.startsWith(rel + '/') && (rel.includes('/') ? dirname(rel) : '') !== into) {
      actions.move(rel, into)
    }
  }
  const dragOver = (into: string) => (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('application/x-latex-path')) return
    e.preventDefault()
    e.stopPropagation()
    setOver(into)
  }

  const row = (n: Node, depth: number) => {
    const isOpen = open.has(n.path)
    const target = n.dir ? n.path : n.path.includes('/') ? dirname(n.path) : ''
    const active = !n.dir && n.path === current
    return (
      <div key={n.path}>
        <div draggable onDragStart={(e) => { e.dataTransfer.setData('application/x-latex-path', n.path)
          e.dataTransfer.effectAllowed = 'move' }}
          onDragOver={dragOver(target)} onDrop={drop(target)}
          onClick={() => { setPicked(n.path); if (n.dir) toggle(n.path); else actions.open(n.path) }}
          onContextMenu={(e) => { e.preventDefault(); setPicked(n.path); setMenu({ x: e.clientX, y: e.clientY,
            node: n }) }}
          title={n.path === main ? 'Main file: Build compiles this' : n.path}
          style={{ paddingLeft: 8 + depth * 14 }}
          className={`flex h-[30px] items-center gap-1.5 rounded-md pr-2 text-sm ${
            active ? 'bg-accent/15 text-accent-text' : picked === n.path ? 'bg-selected' : 'hover:bg-hover'} ${
            over === n.path && n.dir ? 'ring-2 ring-accent ring-inset' : ''}`}>
          {n.dir ? <ChevronRight size={14} className={`shrink-0 text-dim transition-transform ${isOpen ? 'rotate-90' : ''}`} />
            : <span className="w-[13px] shrink-0" />}
          <Icon node={n} open={isOpen} />
          <span className={`truncate ${n.path === main ? 'font-semibold' : ''}`}>{n.name}</span>
        </div>
        {n.dir && isOpen && n.children.map((c) => row(c, depth + 1))}
      </div>
    )
  }

  const items = (n: Node | null): MenuItem[][] => [
    [...(n && !n.dir ? [{ label: 'Open', onClick: () => actions.open(n.path) }] : []),
      ...(n && !n.dir && ext(n.name) === '.tex' && n.path !== main
        ? [{ label: 'Set as main file', onClick: () => actions.setMain(n.path) }] : []),
      { label: 'New file…', onClick: () => actions.newFile(here(n)) },
      { label: 'New folder…', onClick: () => actions.newFolder(here(n)) }],
    n ? [{ label: 'Copy path', onClick: () => actions.copyPath(n.path) },
      { label: 'Rename…', onClick: () => actions.rename(n.path) },
      { label: 'Delete…', onClick: () => actions.remove(n.path), danger: true }] : [],
  ]
  const pickedNode = picked ? entries.find((e) => e.path === picked) : undefined
  const pickedDir = pickedNode ? (pickedNode.kind === 'd' ? picked! : picked!.includes('/') ? dirname(picked!) : '') : ''

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-line pl-3 pr-1">
        <span className="flex-1 text-sm font-semibold text-dim">Files</span>
        {([[FilePlus, 'New file', () => actions.newFile(pickedDir)],
          [FolderPlus, 'New folder', () => actions.newFolder(pickedDir)],
          [RefreshCw, 'Refresh', actions.refresh]] as const).map(([I, label, fn]) => (
          <button key={label} aria-label={label} title={label} onClick={fn}
            className="grid size-7 place-items-center rounded-md text-dim hover:bg-hover hover:text-text">
            <I size={16} /></button>
        ))}
      </div>
      <div className={`min-h-0 flex-1 overflow-y-auto p-1.5 ${over === '' ? 'bg-accent/5' : ''}`}
        onDragOver={dragOver('')} onDrop={drop('')} onDragLeave={() => setOver(null)}
        onClick={(e) => { if (e.target === e.currentTarget) setPicked(null) }}
        onContextMenu={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); setPicked(null)
          setMenu({ x: e.clientX, y: e.clientY, node: null }) } }}>
        {nodes.map((n) => row(n, 0))}
      </div>
      <p className="shrink-0 px-3 pb-3 pt-1 text-xs leading-4 text-dim">Drag files to move them. Right-click for more.</p>
      {menu && <ContextMenu x={menu.x} y={menu.y} sections={items(menu.node)} onClose={() => setMenu(null)} />}
    </div>
  )
}
