import { ChevronDown, ChevronRight, FileCode2, FileText, Folder, FolderOpen, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'

import { call } from '../../../rpc'
import type { Entry, Listing } from '../../../types/files'
import { isDir, isText, join } from '../../files/format'
import { IconButton, Spinner } from '../../ui'

type Node = { entries: Entry[] | null; error: string }

const byName = (a: Entry, b: Entry) =>
  Number(isDir(b)) - Number(isDir(a)) || a.name.localeCompare(b.name, undefined, { numeric: true })

/** Text and code we can show; anything else goes to Files. */
const opens = (e: Entry) => isText(e) || /\.(out|err|log|slurm|sbatch|cfg|ini|c|h|cc|cpp|hpp|cu|f|f90|f95|jl|r|m|R)$/i
  .test(e.name) || !e.name.includes('.')

/** The open folder's files: folders open in place, loaded the first time. */
export function Tree({ cluster, root, head, current, onOpen, onOther }: {
  cluster: string
  root: string                              // the open folder
  head: ReactNode
  current: string | null                    // the open file's path, highlighted
  onOpen: (path: string) => void
  onOther: (path: string) => void           // not text: open it in Files instead
}) {
  const [nodes, setNodes] = useState<Record<string, Node>>({})
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [hidden, setHidden] = useState(false)

  const load = useCallback((dir: string) => {
    setNodes((n) => ({ ...n, [dir]: { entries: n[dir]?.entries ?? null, error: '' } }))
    call<Listing>('files.list', { cluster, path: dir })
      .then((l) => setNodes((n) => ({ ...n, [l.path]: { entries: [...l.entries].sort(byName), error: '' } })))
      .catch((e: Error) => setNodes((n) => ({ ...n, [dir]: { entries: n[dir]?.entries ?? [], error: e.message } })))
  }, [cluster])

  useEffect(() => {  // another cluster or folder: start again at its top
    setNodes({})
    setOpen(new Set())
    load(root)
  }, [cluster, root, load])

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 px-2">
        {head}
        <button type="button" onClick={() => setHidden(!hidden)} title="Show files whose name starts with a dot"
          className={`rounded-md px-1.5 text-xs font-semibold ${hidden ? 'bg-selected text-text' : 'text-dim hover:bg-hover'}`}>
          .files</button>
        <IconButton icon={RefreshCw} label="Refresh" small onClick={refresh} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">{rows(root, 0)}</div>
    </div>
  )
}
