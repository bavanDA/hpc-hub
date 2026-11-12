import type { ReactNode } from 'react'

import { Button } from './Button'
import { useEscape } from './useEscape'
import { OnTop } from './OnTop'

export function AlertDialog({ title, children, keep, act, danger = true, disabled, onAct, onClose }: {
  title: string; children?: ReactNode; keep: string; act: string; danger?: boolean; disabled?: boolean
  onAct: () => void; onClose: () => void
}) {
  useEscape(onClose)
  return (
    <OnTop>
      <div className="dialog-scrim fixed inset-0 z-40 grid place-items-center bg-scrim p-4" onMouseDown={onClose}>
        <div role="alertdialog" aria-modal="true" aria-labelledby="alert-title" onMouseDown={(e) => e.stopPropagation()}
          className="dialog-in w-[420px] max-w-full rounded-xl bg-window p-5 shadow-[var(--shadow-dialog)]">
          <h2 id="alert-title" className="text-lg font-semibold">{title}</h2>
          {children && <div className="mt-2 flex flex-col gap-2 text-base text-dim">{children}</div>}
          <div className="mt-6 flex justify-end gap-2">
            <Button autoFocus onClick={onClose}>{keep}</Button>
            <Button kind={danger ? 'danger-solid' : 'primary'} onClick={onAct} disabled={disabled}>{act}</Button>
          </div>
        </div>
      </div>
    </OnTop>
  )
}
