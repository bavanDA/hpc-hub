import { FolderOpen } from 'lucide-react'
import { useState } from 'react'

import type { Place } from '../../types/projects'
import { Field } from '../e/ui'
import { FolderPicker } from '../projects/FolderPicker'

export function FolderField({ cluster, label = 'Folder', value, onChange, projects }: {
  cluster: { id: string; name: string }; label?: string; value: string; onChange: (v: string) => void
  projects?: Place[]
}) {
  const [picking, setPicking] = useState(false)
  return (
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <Field label={label} value={value === '~' ? '' : value} placeholder="Home folder"
          onChange={(e) => onChange(e.target.value || '~')} />
      </div>
      <button aria-label="Choose a folder" title="Choose a folder" onClick={() => setPicking(true)}
        className="mb-1.5 grid size-10 shrink-0 place-items-center rounded-lg border border-line-strong
          hover:bg-hover active:bg-pressed"><FolderOpen size={18} className="text-dim" /></button>
      {picking && <FolderPicker cluster={{ ...cluster, connected: true }} start={value.trim() || '~'}
        projects={projects} onPick={onChange} onClose={() => setPicking(false)} />}
    </div>
  )
}
