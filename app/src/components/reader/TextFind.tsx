import { ChevronDown, ChevronUp, X } from 'lucide-react'
import type { RefObject } from 'react'

import { Tool } from '../pdf/tool'

export function TextFind({ input, query, hit, onQuery, onStep, onClose }: {
  input: RefObject<HTMLInputElement | null>
  query: string
  hit: { n: number; total: number }
  onQuery: (q: string) => void
  onStep: (back: boolean) => void
  onClose: () => void
}) {
  const q = query.trim()
  return (
    <div className="absolute top-2 right-3 z-30 flex items-center gap-1 rounded-xl border border-line bg-window
      p-1 shadow-lg">
      <input ref={input} value={query} placeholder="Find in text" aria-label="Find in text"
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onStep(e.shiftKey) }
          if (e.key === 'Escape') { e.stopPropagation(); onClose() }
        }}
        className={`h-7 w-44 rounded-md bg-pill px-2 text-sm outline-none focus-visible:ring-2
          focus-visible:ring-inset focus-visible:ring-focus ${q && !hit.total ? 'ring-2 ring-bad' : ''}`} />
      <span className="min-w-[52px] text-center text-xs tabular-nums text-dim">
        {q ? hit.total ? `${hit.n + 1} of ${hit.total}` : 'None' : ''}</span>
      <Tool label="Previous (Shift+Enter)" onClick={() => onStep(true)}><ChevronUp size={16} /></Tool>
      <Tool label="Next (Enter)" onClick={() => onStep(false)}><ChevronDown size={16} /></Tool>
      <Tool label="Close" onClick={onClose}><X size={16} /></Tool>
    </div>
  )
}
