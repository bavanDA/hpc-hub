import type { ReactNode } from 'react'

import { EButton } from './extra'
import { EDialog } from './ui'

/** onKeep: the keep button does something too, which closing the window doesn't. */
export function ConfirmDialog({ title, text, keep, confirm, danger = false, onConfirm, onKeep, onClose }: {
  title: string; text?: ReactNode; keep: string; confirm: string; danger?: boolean; onConfirm: () => void
  onKeep?: () => void; onClose: () => void
}) {
  return (
    <EDialog title={title} width={440} onClose={onClose} actions={<>
      <EButton autoFocus className="flex-1" onClick={() => { onClose(); onKeep?.() }}>{keep}</EButton>
      <EButton kind={danger ? 'danger' : 'primary'} className="flex-1"
        onClick={() => { onClose(); onConfirm() }}>{confirm}</EButton>
    </>}>
      {text && <div className="flex flex-col gap-2 px-5 pb-2 text-dim">{text}</div>}
    </EDialog>
  )
}

export function Note({ error = false, children }: { error?: boolean; children: ReactNode }) {
  return <p role={error ? 'alert' : undefined} className={`px-5 pb-3 break-words ${error ? 'font-semibold text-bad'
    : 'font-semibold'}`}>{children}</p>
}
