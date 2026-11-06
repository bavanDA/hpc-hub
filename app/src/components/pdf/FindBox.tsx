import { ChevronDown, ChevronUp, X } from 'lucide-react'
import type { RefObject } from 'react'

import { Tool } from './tool'

export type Found = { current: number; total: number; missing: boolean }

export function FindBox({ input, query, found, compact, onQuery, onStep, onClose }: {
  input: RefObject<HTMLInputElement | null>
  query: string
  found: Found | null
  compact?: boolean
  onQuery: (q: string) => void
  onStep: (back: boolean) => void
  onClose: () => void
}) {
  return (
    <div className="absolute right-3 top-2 z-10 flex items-center gap-1 rounded-xl border border-line bg-window
      p-1 shadow-lg">
      <input ref={input} value={query} placeholder="Find in PDF" aria-label="Find in PDF"
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onStep(e.shiftKey) }
          if (e.key === 'Escape') { e.stopPropagation(); onClose() }
        }}
        className={`h-7 rounded-md bg-pill px-2 text-sm outline-none pointer-coarse:h-11 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus ${
          compact ? 'w-28' : 'w-44'} ${found?.missing && query ? 'ring-2 ring-bad' : ''}`} />
      <span className="min-w-[52px] text-center text-xs tabular-nums text-dim">
        {query && found ? (found.total ? `${found.current} of ${found.total}` : 'None') : ''}</span>
      <Tool label="Previous (Shift+Enter)" onClick={() => onStep(true)}><ChevronUp size={16} /></Tool>
      <Tool label="Next (Enter)" onClick={() => onStep(false)}><ChevronDown size={16} /></Tool>
      <Tool label="Close" onClick={onClose}><X size={16} /></Tool>
    </div>
  )
}
