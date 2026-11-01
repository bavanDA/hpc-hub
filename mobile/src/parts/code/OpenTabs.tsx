// The files open in the Code tab, as a row of chips under the header (only with two or more). A dot marks unsaved
// edits; a long press offers Close, Close others and Copy path.
import { X } from 'lucide-react'
import { useState } from 'react'

import { closeOthers, isDirty, selectFile, type OpenFile } from '@shared/components/code/store'
import { copyText } from '@shared/components/terminals/xterm'
import { ActionSheet, useToast } from '../../ui'
import { useLongPress } from '../terminal/useLongPress'

type Props = { files: OpenFile[]; current: string | null; onClose: (f: OpenFile) => void }

export function OpenTabs({ files, current, onClose }: Props) {
  const [menu, setMenu] = useState<OpenFile | null>(null)
  const toast = useToast()
  if (files.length < 2) return null
  return (
    <>
      <div className="flex shrink-0 gap-2 overflow-x-auto px-3 pb-2" role="tablist" aria-label="Open files">
        {files.map((f) => <Chip key={f.key} file={f} on={f.key === current} onMenu={() => setMenu(f)}
          onClose={() => onClose(f)} />)}
      </div>
      {menu && (
        <ActionSheet title={menu.name} onClose={() => setMenu(null)} actions={[
          { label: 'Close', onPick: () => onClose(menu) },
          { label: 'Close the others', onPick: () => closeOthers(menu.key) },
          { label: 'Copy path', onPick: () => void copyText(menu.path).then((ok) => toast(ok ? 'Path copied' : "Couldn't copy")) },
        ]} />
      )}
    </>
  )
}

function Chip({ file, on, onMenu, onClose }: { file: OpenFile; on: boolean; onMenu: () => void; onClose: () => void }) {
  const press = useLongPress(() => selectFile(file.key), onMenu)
  return (
    <div role="tab" aria-selected={on} className={`flex h-11 shrink-0 items-center rounded-full pl-4 text-sm font-semibold
      ${on ? 'bg-accent-soft text-accent-text' : 'bg-pill text-dim'}`}>
      <button {...press} className="flex h-full max-w-44 items-center gap-1.5 truncate">
        {isDirty(file) && <span className="size-2 shrink-0 rounded-full bg-accent" aria-label="Unsaved" />}
        <span className="truncate">{file.name}</span>
      </button>
      <button aria-label={`Close ${file.name}`} onClick={onClose}
        className="grid size-11 shrink-0 place-items-center rounded-full active:bg-hover"><X size={16} /></button>
    </div>
  )
}
