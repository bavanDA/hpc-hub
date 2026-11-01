// The card's Log expander: timestamped lines, kept scrolled to the newest unless you scrolled up.
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'

export function LogView({ lines }: { lines: string[] }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLPreElement>(null)
  const pinned = useRef(true)
  useLayoutEffect(() => {
    const el = box.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [lines, open])
  return (
    <div>
      <button onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex w-fit items-center gap-1 rounded-md py-1 pr-2 text-md hover:bg-hover">
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Log
      </button>
      {open && (
        <pre ref={box} onScroll={(e) => {
          const el = e.currentTarget
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
        }}
          className="mt-1 h-40 select-text overflow-auto whitespace-pre-wrap break-all rounded-lg bg-view p-3
            font-mono text-xs leading-[1.45] text-text shadow-[inset_0_0_0_1px_var(--color-line)]">
          {lines.length ? lines.join('\n') : <span className="text-dim">Nothing yet</span>}
        </pre>
      )}
    </div>
  )
}
