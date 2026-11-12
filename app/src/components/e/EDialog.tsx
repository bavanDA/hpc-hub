import { ArrowLeft, X, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { useEscape } from '../ui/useEscape'
import { OnTop } from '../ui/OnTop'

export function EDialog({ title, icon: Icon, onClose, onBack, children, actions, width = 520 }: {
  title: string; icon?: LucideIcon; onClose: () => void; onBack?: () => void; children: ReactNode; actions?: ReactNode
  width?: number
}) {
  useEscape(onClose)
  return (
    <OnTop>
      <div className="style-e dialog-scrim fixed inset-0 z-40 grid place-items-center bg-scrim p-4"
        onMouseDown={onClose}>
        <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
          style={{ width }} className="dialog-in flex max-h-[90vh] max-w-full flex-col rounded-xl bg-window
            shadow-[var(--shadow-dialog)]">
          <header className={`flex h-14 shrink-0 items-center gap-2 pr-2 ${onBack ? 'pl-2' : 'pl-5'}`}>
            {onBack && <button type="button" aria-label="Back" onClick={onBack} className="grid size-9
              place-items-center rounded-md text-dim hover:bg-hover active:bg-pressed"><ArrowLeft size={18} /></button>}
            {Icon && <Icon size={20} className="shrink-0" />}
            <h2 className="min-w-0 flex-1 text-lg font-semibold">{title}</h2>
            <button type="button" aria-label="Close" onClick={onClose} className="grid size-9 place-items-center
              rounded-md text-dim hover:bg-hover active:bg-pressed"><X size={18} /></button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto pb-2">{children}</div>
          {actions && <footer className="flex shrink-0 gap-2 px-5 pt-3 pb-5 [&>button]:h-11">{actions}</footer>}
        </div>
      </div>
    </OnTop>
  )
}
