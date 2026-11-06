import type { ReactNode } from 'react'

import { copy } from '../../clusters/loginCopy'
import { EButton } from '../../e/EButton'

/** The main button, then a quiet "Do this later" under it (asked again on the first Connect). */
export function Footer({ onSkip, children }: { onSkip?: () => void; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 px-5 pt-2">
      {children}
      {onSkip && <EButton kind="quiet" className="text-dim" onClick={onSkip}>{copy.skip}</EButton>}
    </div>
  )
}
