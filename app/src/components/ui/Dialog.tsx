import { X } from 'lucide-react'
import type { ReactNode } from 'react'

import { IconButton } from './IconButton'
import { useEscape } from './useEscape'
import { OnTop } from './OnTop'

export function Dialog({ title, onClose, children, actions, width = 480, height, bare = false }:
  { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode; width?: number; height?: number
    bare?: boolean  // the children lay out and scroll the body themselves
  }) {
  useEscape(onClose)
  return (
    <OnTop>
      <div className="dialog-scrim fixed inset-0 z-40 grid place-items-center bg-scrim p-4" onMouseDown={onClose}>
        <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
          style={{ width, height }}
          className="dialog-in flex max-h-[90vh] max-w-full flex-col rounded-xl bg-window shadow-[var(--shadow-dialog)]">
          <div className="flex h-14 shrink-0 items-center gap-2 pr-2 pl-5">
            <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h2>
            <IconButton icon={X} label="Close" size={18} onClick={onClose} />
          </div>
          <div className={bare ? 'flex min-h-0 flex-1 border-t border-line' : 'overflow-auto px-5 pb-4'}>{children}</div>
          {actions && <div className="flex items-center justify-end gap-2 px-5 pt-3 pb-5">
            {actions}</div>}
        </div>
      </div>
    </OnTop>
  )
}
