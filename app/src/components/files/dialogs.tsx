// Small dialogs: ask for a name (new folder, rename), and confirm before something can't be undone.
import { useState } from 'react'

import { AlertDialog, Button, Dialog } from '../ui'

export function NameDialog({ title, action, initial = '', onDone, onClose }:
  { title: string; action: string; initial?: string; onDone: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(initial)
  const ok = name.trim() !== '' && !name.includes('/') && name.trim() !== initial
  const go = () => { if (ok) { onClose(); onDone(name.trim()) } }
  return (
    <Dialog title={title} onClose={onClose} width={400}
      actions={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button kind="suggested" disabled={!ok} onClick={go}>{action}</Button>
      </>}>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && go()}
        onFocus={(e) => {  // like GTK: the name is picked, not the extension
          const dot = initial.lastIndexOf('.')
          e.target.setSelectionRange(0, dot > 0 ? dot : initial.length)
        }}
        className="h-10 w-full rounded-md bg-pill px-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus" />
      {name.includes('/') && <p className="mt-2 text-sm text-bad">A name can't have / in it.</p>}
    </Dialog>
  )
}

export function ConfirmDialog({ title, text, action, keep = 'Keep it', onYes, onClose }:
  { title: string; text: string; action: string; keep?: string; onYes: () => void; onClose: () => void }) {
  return (
    <AlertDialog title={title} keep={keep} act={action} onClose={onClose} onAct={() => { onClose(); onYes() }}>
      <p>{text}</p>
    </AlertDialog>
  )
}
