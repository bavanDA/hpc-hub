// The paper's files, from the bar's panel button: a panel over the page. Tap a text file to edit it; ⋮ for main file,
// rename, delete and copy path, and New file or New folder at the top. Folders are shown open, folders first.
import { BookOpen, Copy, File, FilePlus, FileText, Folder, FolderPlus, Image, MoreVertical, Pencil, RefreshCw, Star,
  Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { basename, dirname, ext, IMAGE_EXT, TEXT_EXT } from '@shared/components/latex/bits'
import type { TreeEntry } from '@shared/types/latex'
import { useBackLayer } from '../../nav'
import { Button, ConfirmDialog, Dialog, Field, IconBtn, Menu, type MenuItem } from '../../ui'

export type FileActions = {
  open: (rel: string) => void
  newFile: (into: string, name: string) => void
  newFolder: (into: string, name: string) => void
  rename: (rel: string, name: string) => void
  remove: (rel: string) => void
  setMain: (rel: string) => void
  copyPath: (rel: string) => void
  refresh: () => void
}

type Ask = { kind: 'rename' | 'delete'; entry: TreeEntry } | { kind: 'file' | 'folder'; into: string }

/** Folders first at each level, by name, keeping each folder's contents right under it. */
function ordered(entries: TreeEntry[]): TreeEntry[] {
  const kids = new Map<string, TreeEntry[]>()
  for (const e of entries) {
    const parent = e.path.includes('/') ? dirname(e.path) : ''
    kids.set(parent, [...(kids.get(parent) ?? []), e])
  }
  const out: TreeEntry[] = []
  const walk = (dir: string) => {
    const list = (kids.get(dir) ?? []).sort((a, b) => a.kind === b.kind
      ? basename(a.path).localeCompare(basename(b.path), undefined, { sensitivity: 'base' }) : a.kind === 'd' ? -1 : 1)
    for (const e of list) { out.push(e); if (e.kind === 'd') walk(e.path) }
  }
  walk('')
  return out
}

function iconFor(e: TreeEntry) {
  const x = ext(e.path), cls = 'shrink-0 text-dim'
  if (e.kind === 'd') return <Folder size={18} className={cls} />
  if (x === '.tex') return <FileText size={18} className={cls} />
  if (x === '.bib') return <BookOpen size={18} className={cls} />
  if (IMAGE_EXT.includes(x) || x === '.pdf' || x === '.eps') return <Image size={18} className={cls} />
  return <File size={18} className={cls} />
}

export function FilesPanel({ entries, current, main, actions, onClose }: { entries: TreeEntry[]; current: string
  main: string; actions: FileActions; onClose: () => void }) {
  const list = useMemo(() => ordered(entries), [entries])
  const [ask, setAsk] = useState<Ask | null>(null)
  const done = () => setAsk(null)
  useBackLayer(onClose)

  const menu = (e: TreeEntry): MenuItem[][] => [
    [...(e.kind === 'd' ? [
      { label: 'New file in it', icon: FilePlus, onClick: () => setAsk({ kind: 'file', into: e.path }) },
      { label: 'New folder in it', icon: FolderPlus, onClick: () => setAsk({ kind: 'folder', into: e.path }) },
    ] : []),
    ...(e.kind === 'f' && ext(e.path) === '.tex' && e.path !== main
      ? [{ label: 'Set as main file', icon: Star, onClick: () => actions.setMain(e.path) }] : []),
    { label: 'Copy path', icon: Copy, onClick: () => actions.copyPath(e.path) },
    { label: 'Rename', icon: Pencil, onClick: () => setAsk({ kind: 'rename', entry: e }) },
    { label: 'Delete', icon: Trash2, danger: true, onClick: () => setAsk({ kind: 'delete', entry: e }) }],
  ]

  return (
    <>
      <div className="dialog-scrim fixed inset-0 z-30 bg-scrim" onClick={onClose} />
      <aside aria-label="Files" className="drawer-in fixed top-[var(--top)] bottom-[var(--bottom)] left-0 z-30 flex w-[300px]
        max-w-[85%] flex-col border-r border-line bg-window shadow-[var(--shadow-menu)]">
        <div className="flex h-12 shrink-0 items-center gap-0.5 border-b border-line pr-1 pl-4">
          <span className="flex-1 font-semibold">Files</span>
          <IconBtn icon={FilePlus} label="New file" small onClick={() => setAsk({ kind: 'file', into: '' })} />
          <IconBtn icon={FolderPlus} label="New folder" small onClick={() => setAsk({ kind: 'folder', into: '' })} />
          <IconBtn icon={RefreshCw} label="Refresh" small onClick={actions.refresh} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {list.map((e) => {
            const depth = e.path.split('/').length - 1
            const text = e.kind === 'f' && TEXT_EXT.includes(ext(e.path))
            return (
              <div key={e.path} style={{ paddingLeft: 12 + depth * 14 }}
                className={`flex h-11 items-center pr-1 ${e.path === current ? 'bg-selected' : ''}`}>
                <button disabled={!text} onClick={() => { onClose(); actions.open(e.path) }}
                  className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left enabled:active:opacity-60">
                  {iconFor(e)}
                  <span className={`truncate ${e.path === main ? 'font-semibold' : ''} ${e.kind === 'f' && !text ? 'text-dim' : ''}`}>
                    {basename(e.path)}</span>
                </button>
                <Menu label={`More for ${basename(e.path)}`} trigger={<MoreVertical size={16} />} groups={menu(e)}
                  className="grid size-9 shrink-0 place-items-center rounded-md text-dim active:bg-pressed" />
              </div>
            )
          })}
          {!list.length && <p className="px-4 py-6 text-center text-dim">No files yet.</p>}
        </div>
      </aside>

      {ask?.kind === 'rename' && <NameDialog title={`Rename ${basename(ask.entry.path)}`} action="Rename"
        initial={basename(ask.entry.path)} onClose={done} onDone={(name) => actions.rename(ask.entry.path, name)} />}
      {ask?.kind === 'delete' && <ConfirmDialog title={`Delete ${basename(ask.entry.path)}?`} keep="Keep it" confirm="Delete" danger
        text={ask.entry.kind === 'd' ? 'It is removed with everything inside. There is no trash.' : 'There is no trash, so it is gone for good.'}
        onConfirm={() => actions.remove(ask.entry.path)} onClose={done} />}
      {ask?.kind === 'file' && <NameDialog title={ask.into ? `New file in ${ask.into}` : 'New file'} action="Create" placeholder="section.tex"
        onClose={done} onDone={(name) => actions.newFile(ask.into, name)} />}
      {ask?.kind === 'folder' && <NameDialog title={ask.into ? `New folder in ${ask.into}` : 'New folder'} action="Create" placeholder="figures"
        onClose={done} onDone={(name) => actions.newFolder(ask.into, name)} />}
    </>
  )
}

function NameDialog({ title, action, initial = '', placeholder, onDone, onClose }: {
  title: string; action: string; initial?: string; placeholder?: string; onDone: (name: string) => void; onClose: () => void
}) {
  const [name, setName] = useState(initial)
  const ok = name.trim() !== '' && !name.includes('/') && name.trim() !== initial
  const go = () => { if (ok) { onClose(); onDone(name.trim()) } }
  return (
    <Dialog title={title} width={400} onClose={onClose} actions={<>
      <Button className="flex-1" onClick={onClose}>Cancel</Button>
      <Button kind="primary" className="flex-1" disabled={!ok} onClick={go}>{action}</Button>
    </>}>
      <form className="px-5" onSubmit={(e) => { e.preventDefault(); go() }}>
        <Field label="Name" value={name} placeholder={placeholder} autoFocus autoCapitalize="none" autoCorrect="off"
          onChange={(e) => setName(e.target.value)} />
        {name.includes('/') && <p className="pb-1 text-sm text-bad">A name can't have / in it.</p>}
      </form>
    </Dialog>
  )
}
