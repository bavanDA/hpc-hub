import { useState } from 'react'

import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Field } from './Field'

export function NewFolder({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState('')
  const ok = !!name.trim() && !name.includes('/')
  const create = () => ok && onCreate(name.trim())
  return (
    <Dialog title="New folder" onClose={onClose} width={380}
      actions={<><Button onClick={onClose}>Cancel</Button>
        <Button kind="primary" disabled={!ok} onClick={create}>Create</Button></>}>
      <Field autoFocus className="w-full" placeholder="Folder name" value={name}
        onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
    </Dialog>
  )
}
