import type { ReactNode } from 'react'

import { useEscape } from '../ui/useEscape'
import { EButton } from './EButton'
import { OnTop } from '../ui/OnTop'

export function Confirm({ title, children, keep, act, danger = true, disabled, onAct, onClose }: {
  title: string; children?: ReactNode; keep: string; act: string; danger?: boolean; disabled?: boolean
  onAct: () => void; onClose: () => void
}) {
  useEscape(onClose)
  return (
    <OnTop>
      <div className="style-e dialog-scrim fixed inset-0 z-50 grid place-items-center bg-scrim p-4" onMouseDown={onClose}>
        <div role="alertdialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
          className="dialog-in w-[420px] max-w-full rounded-xl bg-window p-5 shadow-[var(--shadow-dialog)]">
          <h2 className="text-lg font-semibold">{title}</h2>
          {children && <div className="mt-1.5 flex flex-col gap-2 text-dim">{children}</div>}
          <div className="mt-5 flex justify-end gap-2">
            <EButton autoFocus onClick={onClose}>{keep}</EButton>
            <EButton kind={danger ? 'danger' : 'primary'} disabled={disabled} onClick={onAct}>{act}</EButton>
          </div>
        </div>
      </div>
    </OnTop>
  )
}
