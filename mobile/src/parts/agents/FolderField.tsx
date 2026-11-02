// A folder on the cluster: type it, or pick it with the folder sheet.
import { FolderOpen } from 'lucide-react'
import { useState } from 'react'

import { Field } from '../../ui'
import { FolderSheet } from '../terminal/FolderSheet'

export function FolderField({ cluster, name, label = 'Folder', value, onChange }:
  { cluster: string; name: string; label?: string; value: string; onChange: (v: string) => void }) {
  const [picking, setPicking] = useState(false)
  return (
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <Field label={label} value={value} autoCapitalize="none" autoCorrect="off" spellCheck={false}
          placeholder="~ (your home folder)" onChange={(e) => onChange(e.target.value)} />
      </div>
      <button aria-label="Choose a folder" onClick={() => setPicking(true)}
        className="mb-2 grid size-12 shrink-0 place-items-center rounded-lg border border-line-strong active:bg-pressed">
        <FolderOpen size={22} className="text-dim" /></button>
      {picking && <FolderSheet cluster={cluster} name={name} start={value.trim() || '~'} onPick={onChange}
        onClose={() => setPicking(false)} />}
    </div>
  )
}
