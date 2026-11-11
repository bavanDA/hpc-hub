// The files open in Code as the desktop's tab row, with the file tree's button at its end. A dot marks unsaved edits;
// a long press offers Close, Close others and Copy path.
import { FolderTree, X } from 'lucide-react'
import { useState } from 'react'

import { closeOthers, isDirty, selectFile, type OpenFile } from '@shared/components/code/store'
import { copyText } from '@shared/components/terminals/xterm'
import { ActionSheet, useToast } from '../../ui'
import { useLongPress } from '../terminal/useLongPress'

export function FileTabs({ files, current, onClose, onTree }: {
  files: OpenFile[]; current: string | null; onClose: (f: OpenFile) => void; onTree: () => void
}) {
  const [menu, setMenu] = useState<OpenFile | null>(null)
  const toast = useToast()
  return (
    <div className="flex h-9 shrink-0 items-end border-b border-line pr-1 pl-1">
      <div role="tablist" aria-label="Open files" className="flex h-full min-w-0 flex-1 items-end overflow-x-auto
        [scrollbar-width:none]">
        {files.map((f) => <FileTab key={f.key} file={f} on={f.key === current} onMenu={() => setMenu(f)}
          onClose={() => onClose(f)} />)}
      </div>
      <button aria-label="Files" onClick={onTree} className="grid size-8 shrink-0 place-items-center self-center
        rounded-md text-dim active:bg-pressed"><FolderTree size={16} /></button>
      {menu && (
        <ActionSheet title={menu.name} onClose={() => setMenu(null)} actions={[
          { label: 'Close', onPick: () => onClose(menu) },
          { label: 'Close the others', onPick: () => closeOthers(menu.key) },
          { label: 'Copy path', onPick: () => void copyText(menu.path).then((ok) => toast(ok ? 'Path copied' : "Couldn't copy")) },
        ]} />
      )}
    </div>
  )
}

function FileTab({ file, on, onMenu, onClose }: { file: OpenFile; on: boolean; onMenu: () => void; onClose: () => void }) {
  const press = useLongPress(() => selectFile(file.key), onMenu)
  const dirty = isDirty(file)
  return (
    <div role="tab" aria-selected={on} className={`-mb-px flex h-9 max-w-[200px] shrink-0 items-center gap-1 border-b-2
      text-sm ${on ? 'border-accent font-semibold' : 'border-transparent text-dim'}`}>
      <button {...press} className="flex h-full min-w-0 items-center gap-1.5 pl-3 whitespace-nowrap">
        <span className="truncate">{file.name}</span>
      </button>
      <button aria-label={`Close ${file.name}`} onClick={onClose} className="grid size-6 shrink-0 place-items-center rounded
        active:bg-pressed">
        {dirty ? <span className="size-2 rounded-full bg-text" aria-label="Unsaved" /> : on ? <X size={14} /> : null}
      </button>
    </div>
  )
}
