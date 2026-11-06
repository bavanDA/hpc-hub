import { useState } from 'react'

import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { inputClass, type Target } from './SessionMenu'

export function RenameDialog({ target, onClose, onRename }:
  { target: Target; onClose: () => void; onRename: (label: string) => void }) {
  const [label, setLabel] = useState(target.title)
  const ok = label.trim() !== ''
  const done = () => { if (ok) { onClose(); onRename(label.trim()) } }
  return (
    <Dialog title="Rename session" onClose={onClose} width={400} actions={<>
      <Button onClick={onClose}>Cancel</Button>
      <Button kind="primary" disabled={!ok} onClick={done}>Rename</Button>
    </>}>
      <p className="mb-3 text-sm text-dim">{target.name}</p>
      <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass}
        onKeyDown={(e) => e.key === 'Enter' && done()} />
    </Dialog>
  )
}
