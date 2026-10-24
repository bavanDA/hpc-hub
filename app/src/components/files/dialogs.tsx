// Small dialogs: ask for a name (new folder, rename), and confirm before something can't be undone.
import { useState } from 'react'

import { Button, Dialog } from '../ui'

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
        className="h-10 w-full rounded-md bg-pill px-3 outline-none focus:ring-2 focus:ring-accent" />
      {name.includes('/') && <p className="mt-2 text-[13px] text-bad">A name can't have / in it.</p>}
    </Dialog>
  )
}

export function ConfirmDialog({ title, text, action, onYes, onClose }:
  { title: string; text: string; action: string; onYes: () => void; onClose: () => void }) {
  return (
    <Dialog title={title} onClose={onClose} width={420}
      actions={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button kind="destructive" onClick={() => { onClose(); onYes() }}>{action}</Button>
      </>}>
      <p className="text-center text-dim">{text}</p>
    </Dialog>
  )
}
