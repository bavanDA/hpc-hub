// A cluster's log in its own window: timestamped lines, kept scrolled to the newest unless you scrolled up.
import { useLayoutEffect, useRef } from 'react'

import { EDialog } from '../e/ui'

export function LogDialog({ name, lines, onClose }: { name: string; lines: string[]; onClose: () => void }) {
  const box = useRef<HTMLPreElement>(null)
  const pinned = useRef(true)
  useLayoutEffect(() => {
    const el = box.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [lines])
  return (
    <EDialog title={`${name} log`} width={720} onClose={onClose}>
      <pre ref={box} onScroll={(e) => {
        const el = e.currentTarget
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
      }}
        className="mx-5 mb-3 h-[60vh] overflow-auto rounded-lg border border-line p-3 font-mono text-xs leading-[1.5]
          break-all whitespace-pre-wrap select-text">
        {lines.length ? lines.join('\n') : <span className="text-dim">Nothing yet</span>}
      </pre>
    </EDialog>
  )
}
