import { BookOpenText, Columns2, FileText, ScrollText } from 'lucide-react'
import type { ReactNode } from 'react'

export type View = 'editor' | 'split' | 'pdf' | 'reader' | 'history'

const VIEWS = [['editor', 'Editor', FileText], ['split', 'Both', Columns2], ['pdf', 'PDF', ScrollText],
  ['reader', 'Reader', BookOpenText]] as const

/** Editor, Both, PDF, Reader; `more` holds the History tab. */
export function ViewSwitch({ view, onView, more }: { view: View; onView: (v: View) => void; more: ReactNode }) {
  return (
    <div role="radiogroup" aria-label="Show" className="flex gap-[3px] rounded-lg border border-line-strong p-[3px]">
      {VIEWS.map(([v, label, I]) => (
        <button key={v} role="radio" aria-checked={view === v} onClick={() => onView(v)} title={label}
          className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm ${view === v
            ? 'bg-accent font-semibold text-on-accent' : 'text-dim hover:bg-hover hover:text-text'}`}>
          <I size={14} /> {label}</button>
      ))}
      {more}
    </div>
  )
}
