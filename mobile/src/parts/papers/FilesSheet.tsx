// The paper's files, full screen: tap a text file to edit it, ⋮ for main file, rename, delete and copy path,
// and New file or New folder at the top. Folders are shown open, indented, folders first.
import { BookOpen, Copy, File, FilePlus, FileText, Folder, FolderPlus, Image, MoreVertical, Pencil, Star, Trash2 }
  from 'lucide-react'
import { useMemo, useState } from 'react'

import { basename, dirname, ext, IMAGE_EXT, TEXT_EXT } from '@shared/components/latex/bits'
import type { TreeEntry } from '@shared/types/latex'
import { ActionSheet, Button, ConfirmSheet, PromptSheet, Sheet } from '../../ui'

export type FileActions = {
  open: (rel: string) => void
  newFile: (into: string, name: string) => void
  newFolder: (into: string, name: string) => void
  rename: (rel: string, name: string) => void
  remove: (rel: string) => void
  setMain: (rel: string) => void
  copyPath: (rel: string) => void
}

type Ask = { kind: 'menu' | 'rename' | 'delete'; entry: TreeEntry } | { kind: 'file' | 'folder'; into: string }

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
  const x = ext(e.path)
  if (e.kind === 'd') return <Folder size={20} className="shrink-0 text-accent-text" />
  if (x === '.tex') return <FileText size={20} className="shrink-0 text-ok" />
  if (x === '.bib') return <BookOpen size={20} className="shrink-0 text-warn" />
  if (IMAGE_EXT.includes(x) || x === '.pdf' || x === '.eps') return <Image size={20} className="shrink-0 text-dim" />
  return <File size={20} className="shrink-0 text-dim" />
}

export function FilesSheet({ entries, current, main, actions, onClose }: { entries: TreeEntry[]; current: string
  main: string; actions: FileActions; onClose: () => void }) {
  const list = useMemo(() => ordered(entries), [entries])
  const [ask, setAsk] = useState<Ask | null>(null)
  const done = () => setAsk(null)

  return (
    <Sheet title="Files" onClose={onClose}>
      <div className="mb-3 flex gap-2">
        <Button icon={FilePlus} className="flex-1" onClick={() => setAsk({ kind: 'file', into: '' })}>New file</Button>
        <Button icon={FolderPlus} className="flex-1" onClick={() => setAsk({ kind: 'folder', into: '' })}>New folder</Button>
      </div>
      {list.map((e) => {
        const depth = e.path.split('/').length - 1
        const text = e.kind === 'f' && TEXT_EXT.includes(ext(e.path))
        return (
          <div key={e.path} style={{ paddingLeft: depth * 20 }}
            className={`flex min-h-12 items-center gap-1 rounded-xl ${e.path === current ? 'bg-selected' : ''}`}>
            <button disabled={!text} onClick={() => { onClose(); actions.open(e.path) }}
              className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-2 text-left enabled:active:bg-hover">
              {iconFor(e)}
              <span className={`min-w-0 flex-1 truncate ${e.kind === 'f' && !text ? 'text-dim' : ''}`}>
                {basename(e.path)}</span>
              {e.path === main && <span className="rounded-full bg-ok-bg px-2 py-0.5 text-xs font-semibold text-ok">
                main</span>}
            </button>
            <button aria-label={`More for ${basename(e.path)}`} onClick={() => setAsk({ kind: 'menu', entry: e })}
              className="grid size-11 shrink-0 place-items-center rounded-full text-dim active:bg-hover">
              <MoreVertical size={20} /></button>
          </div>
        )
      })}
      {!list.length && <p className="py-6 text-center text-dim">No files yet.</p>}

      {ask?.kind === 'menu' && <ActionSheet title={basename(ask.entry.path)} onClose={done} actions={[
        ...(ask.entry.kind === 'd' ? [
          { label: 'New file in it', icon: FilePlus, onPick: () => setAsk({ kind: 'file', into: ask.entry.path }) },
          { label: 'New folder in it', icon: FolderPlus, onPick: () => setAsk({ kind: 'folder', into: ask.entry.path }) },
        ] : []),
        ...(ask.entry.kind === 'f' && ext(ask.entry.path) === '.tex' && ask.entry.path !== main
          ? [{ label: 'Make it the main file', icon: Star, onPick: () => actions.setMain(ask.entry.path) }] : []),
        { label: 'Rename', icon: Pencil, onPick: () => setAsk({ kind: 'rename', entry: ask.entry }) },
        { label: 'Copy path', icon: Copy, onPick: () => actions.copyPath(ask.entry.path) },
        { label: 'Delete', icon: Trash2, danger: true, onPick: () => setAsk({ kind: 'delete', entry: ask.entry }) },
      ]} />}
      {ask?.kind === 'rename' && <PromptSheet title={`Rename ${basename(ask.entry.path)}`} label="New name"
        value={basename(ask.entry.path)} confirm="Rename" onClose={done}
        onSubmit={(name) => actions.rename(ask.entry.path, name)} />}
      {ask?.kind === 'delete' && <ConfirmSheet title={`Delete ${basename(ask.entry.path)}?`} keep="Keep it" confirm="Delete" danger
        text={ask.entry.kind === 'd' ? 'The folder and everything in it are removed from the cluster. There is no trash.'
          : 'It is removed from the cluster. There is no trash.'}
        onConfirm={() => actions.remove(ask.entry.path)} onClose={done} />}
      {ask?.kind === 'file' && <PromptSheet title={ask.into ? `New file in ${ask.into}` : 'New file'} label="Name"
        placeholder="section.tex" confirm="Create" onClose={done} onSubmit={(name) => actions.newFile(ask.into, name)} />}
      {ask?.kind === 'folder' && <PromptSheet title={ask.into ? `New folder in ${ask.into}` : 'New folder'} label="Name"
        placeholder="figures" confirm="Create" onClose={done} onSubmit={(name) => actions.newFolder(ask.into, name)} />}
    </Sheet>
  )
}
