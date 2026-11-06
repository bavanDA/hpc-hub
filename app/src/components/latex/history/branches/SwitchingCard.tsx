import { Loader2 } from 'lucide-react'

import type { Step } from '../../../../types/history'
import { plural } from '../format'
import { Steps } from './Steps'

export function SwitchingCard({ target, steps, expected, brought, seconds }:
  { target: string; steps: Step[]; expected: string[]; brought: number; seconds: number }) {
  return (
    <div className="dialog-in absolute top-28 left-1/2 z-20 w-[460px] max-w-[90%] -translate-x-1/2 rounded-xl border
      border-line bg-raised p-5 shadow-[var(--shadow-dialog)]">
      <div className="flex items-center gap-2.5">
        <Loader2 size={18} className="animate-spin" />
        <span className="flex-1 font-semibold">Switching to {target}</span>
        <span className="text-sm tabular-nums text-dim">{seconds} s</span>
      </div>
      {brought > 0 && <p className="mt-1 pl-7 text-sm text-dim">Your {plural(brought, 'change')} come along.</p>}
      <div className="mt-4"><Steps steps={steps} todo={expected.slice(steps.length)} /></div>
      <p className="mt-4 border-t border-line pt-3 text-xs text-dim">Editing is paused until the files are in place,
        so nothing is lost. You can keep reading the PDF.</p>
    </div>
  )
}
