// The Log pane: errors and warnings from the last build (tap one to jump to its line), and the raw log.
import { AlertTriangle, ChevronRight, CircleX, Info, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { counts } from '@shared/components/latex/Logs'
import { Spinner } from '@shared/components/ui'
import type { BuildDone, Issue } from '@shared/types/latex'
import { Button } from '../../ui'

const LOOK = {
  error: { icon: CircleX, bar: 'border-l-bad', text: 'text-bad', label: 'Error' },
  warning: { icon: AlertTriangle, bar: 'border-l-line-strong', text: 'text-dim', label: 'Warning' },
  box: { icon: Info, bar: 'border-l-line', text: 'text-dim', label: 'Bad box' },
}

export function LogPane({ running, log, last, onGo, onStop }:
  { running: boolean; log: string; last: BuildDone | null; onGo: (i: Issue) => void; onStop: () => void }) {
  const issues = last?.issues ?? []
  const [raw, setRaw] = useState(running || !issues.length)
  const end = useRef<HTMLDivElement>(null)
  const { errors, warnings } = counts(issues)
  useEffect(() => { if (running) setRaw(true) }, [running])
  useEffect(() => { if (raw && running) end.current?.scrollIntoView({ block: 'end' }) }, [log, raw, running])

  return (
    <div className="h-full overflow-y-auto px-4 pt-2 pb-24">
      <div className="mb-3 flex min-h-12 items-center gap-2">
        {running ? <span className="flex flex-1 items-center gap-2 text-dim"><Spinner size={18} /> Building</span>
          : last ? <span className={`flex-1 font-semibold ${last.ok ? '' : 'text-bad'}`}>
              {last.stopped ? 'Stopped' : last.ok ? `Built in ${last.seconds} s` : 'Build failed'}</span>
          : <span className="flex-1 text-dim">Nothing built yet. Tap Build.</span>}
        {running && <Button icon={Square} onClick={onStop}>Stop</Button>}
      </div>
      {!running && last && (
        <div className="mb-3 flex gap-2 text-sm">
          <span className={`rounded-full border px-3 py-1 font-semibold ${errors ? 'border-bad text-bad'
            : 'border-line-strong text-dim'}`}>
            {errors} {errors === 1 ? 'error' : 'errors'}</span>
          <span className="rounded-full border border-line-strong px-3 py-1 font-semibold text-dim">
            {warnings} {warnings === 1 ? 'warning' : 'warnings'}</span>
        </div>
      )}
      <div className="-mx-4 border-t border-line">
        {issues.map((i, n) => {
          const L = LOOK[i.level]
          return (
            <button key={n} onClick={() => onGo(i)} disabled={!i.line}
              className={`flex min-h-14 w-full gap-3 border-b border-l-4 border-b-line ${L.bar} px-4 py-3 text-left
                enabled:active:bg-pressed`}>
              <L.icon size={20} className={`mt-0.5 shrink-0 ${L.text}`} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold [overflow-wrap:anywhere]">{i.message}</span>
                <span className="block text-sm text-dim">
                  {L.label}{i.file ? ` · ${i.file}` : ''}{i.line ? `, line ${i.line}` : ''}</span>
              </span>
            </button>
          )
        })}
      </div>
      {(log || running) && (
        <div className="mt-4">
          <button onClick={() => setRaw(!raw)} className="flex min-h-12 items-center gap-1 font-semibold text-dim">
            <ChevronRight size={18} className={raw ? 'rotate-90' : ''} /> Full log</button>
          {raw && <pre className="mt-1 whitespace-pre-wrap rounded-[10px] bg-soft p-3 font-mono text-xs leading-[17px]
            select-text [overflow-wrap:anywhere]">{log || ' '}</pre>}
          <div ref={end} />
        </div>
      )}
    </div>
  )
}
