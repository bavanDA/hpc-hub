// The Code page's file tree: folders open in place (files.list, loaded the first time you open them), files open in
// the editor. The root is your home, a project, or a folder you went to; projects on this cluster sit on top.
import { ChevronDown, ChevronRight, FileCode2, FileText, Folder, FolderOpen, FolderUp, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { call } from '../../../rpc'
import type { Entry, Listing } from '../../../types/files'
import type { Project } from '../../../types/projects'
import { isDir, isText, join, parent } from '../../files/format'
import { IconButton, Spinner } from '../../ui'

type Node = { entries: Entry[] | null; error: string }

const byName = (a: Entry, b: Entry) =>
  Number(isDir(b)) - Number(isDir(a)) || a.name.localeCompare(b.name, undefined, { numeric: true })

/** Text and code we can show; anything else goes to Files. */
const opens = (e: Entry) => isText(e) || /\.(out|err|log|slurm|sbatch|cfg|ini|c|h|cc|cpp|hpp|cu|f|f90|f95|jl|r|m|R)$/i
  .test(e.name) || !e.name.includes('.')

export function Tree({ cluster, root, current, onRoot, onOpen, onOther }: {
  cluster: string
  root: string                              // '' until the cluster's home is known
  current: string | null                    // the open file's path, highlighted
  onRoot: (path: string) => void
  onOpen: (path: string) => void
  onOther: (path: string) => void           // not text: open it in Files instead
}) {
  const [nodes, setNodes] = useState<Record<string, Node>>({})
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [home, setHome] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [hidden, setHidden] = useState(false)

  const load = useCallback((dir: string) => {
    setNodes((n) => ({ ...n, [dir]: { entries: n[dir]?.entries ?? null, error: '' } }))
    call<Listing>('files.list', { cluster, path: dir })
      .then((l) => {
        if (!dir) { setHome(l.path); onRoot(l.path) }
        setNodes((n) => ({ ...n, [l.path]: { entries: [...l.entries].sort(byName), error: '' } }))
      })
      .catch((e: Error) => setNodes((n) => ({ ...n, [dir]: { entries: n[dir]?.entries ?? [], error: e.message } })))
  }, [cluster, onRoot])

  useEffect(() => {  // a new cluster: start again at its home, or the root asked for
    setNodes({})
    setOpen(new Set())
    load(root)
    call<Project[]>('projects.list').then((all) => setProjects(all.filter((p) => p.cluster === cluster)))
      .catch(() => setProjects([]))
  }, [cluster])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (root && !nodes[root]) load(root)
  }, [root])  // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (dir: string) => {
    const next = new Set(open)
    if (next.has(dir)) next.delete(dir)
    else {
      next.add(dir)
      if (!nodes[dir]?.entries) load(dir)
    }
    setOpen(next)
  }

  const refresh = () => {
    const dirs = [root, ...open]
    setNodes({})
    dirs.forEach(load)
  }

  function rows(dir: string, depth: number): React.ReactNode {
    const n = nodes[dir]
    if (!n || n.entries === null) {
      return <div className="flex h-7 items-center gap-2 text-sm text-dim" style={{ paddingLeft: 12 + depth * 14 }}>
        <Spinner size={12} /> Loading</div>
    }
    if (n.error) {
      return <p className="py-1 text-sm text-bad" style={{ paddingLeft: 12 + depth * 14 }}>{n.error}</p>
    }
    const list = n.entries.filter((e) => hidden || !e.name.startsWith('.'))
    if (!list.length) {
      return <p className="py-1 text-sm text-dim" style={{ paddingLeft: 12 + depth * 14 }}>Empty</p>
    }
    return list.map((e) => {
      const path = join(dir, e.name)
      const isOpen = open.has(path)
      const folder = isDir(e)
      const Icon = folder ? (isOpen ? FolderOpen : Folder) : opens(e) ? FileCode2 : FileText
      return (
        <div key={path}>
          <button type="button" title={path}
            onClick={() => (folder ? toggle(path) : opens(e) ? onOpen(path) : onOther(path))}
            onDoubleClick={() => folder && onRoot(path)}
            className={`flex h-7 w-full items-center gap-1.5 truncate rounded-md pr-2 text-left text-sm
              transition-colors duration-90 hover:bg-hover ${current === path ? 'bg-selected font-semibold' : ''}
              ${!folder && !opens(e) ? 'text-dim' : ''}`}
            style={{ paddingLeft: 6 + depth * 14 }}>
            {folder ? (isOpen ? <ChevronDown size={14} className="shrink-0 text-dim" />
              : <ChevronRight size={14} className="shrink-0 text-dim" />) : <span className="w-3.5 shrink-0" />}
            <Icon size={14} className={`shrink-0 text-dim`} />
            <span className="truncate">{e.name}</span>
          </button>
          {folder && isOpen && rows(path, depth + 1)}
        </div>
      )
    })
  }

  const short = root && home && root.startsWith(home) ? `~${root.slice(home.length)}` : root
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {projects.length > 0 && (
        <div className="border-b border-line px-2 py-2">
          <p className="px-2 pb-1 text-xs font-semibold text-dim uppercase">Projects</p>
          {projects.map((p) => (
            <button key={p.id} type="button" title={p.path} onClick={() => onRoot(p.path)}
              className={`flex h-7 w-full items-center gap-2 truncate rounded-md px-2 text-left text-sm hover:bg-hover
                ${root === p.path ? 'bg-selected font-semibold' : ''}`}>
              <Folder size={14} className="shrink-0 text-dim" />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
          {home && root !== home && (
            <button type="button" onClick={() => onRoot(home)}
              className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-dim hover:bg-hover">
              <Folder size={14} className="shrink-0" /> Home
            </button>
          )}
        </div>
      )}
      <div className="flex h-9 shrink-0 items-center gap-1 px-2">
        <IconButton icon={FolderUp} label="Up one folder" small disabled={!root || root === '/'}
          onClick={() => onRoot(parent(root))} />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-dim" title={root}>{short || '…'}</span>
        <button type="button" onClick={() => setHidden(!hidden)} title="Show files whose name starts with a dot"
          className={`rounded-md px-1.5 text-xs font-semibold ${hidden ? 'bg-selected text-text' : 'text-dim hover:bg-hover'}`}>
          .files</button>
        <IconButton icon={RefreshCw} label="Refresh" small onClick={refresh} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">{root ? rows(root, 0) : rows('', 0)}</div>
    </div>
  )
}
