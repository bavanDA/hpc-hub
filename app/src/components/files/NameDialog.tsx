import { useState } from 'react'

import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { FIELD } from '../ui/field'

export function NameDialog({ title, action, initial = '', onDone, onClose }:
  { title: string; action: string; initial?: string; onDone: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(initial)
  const ok = name.trim() !== '' && !name.includes('/') && name.trim() !== initial
  const go = () => { if (ok) { onClose(); onDone(name.trim()) } }
  return (
    <Dialog title={title} onClose={onClose} width={400}
      actions={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button kind="primary" disabled={!ok} onClick={go}>{action}</Button>
      </>}>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && go()}
        onFocus={(e) => {  // the name is picked, not the extension
          const dot = initial.lastIndexOf('.')
          e.target.setSelectionRange(0, dot > 0 ? dot : initial.length)
        }}
        className={`${FIELD} h-10 w-full`} />
      {name.includes('/') && <p className="mt-2 text-sm text-bad">A name can't have / in it.</p>}
    </Dialog>
  )
}
