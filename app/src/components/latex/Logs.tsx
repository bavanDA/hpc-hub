// The build's log and issues, over the PDF like Overleaf's: errors and warnings that jump to their line,
// and the raw log below.
import { AlertTriangle, ChevronRight, CircleX, Info, Square, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { BuildDone, Issue } from '../../types/latex'
import { Button, Spinner } from '../ui'

const LOOK = {
  error: { icon: CircleX, bar: 'border-l-bad', text: 'text-bad', label: 'Error' },
  warning: { icon: AlertTriangle, bar: 'border-l-warn', text: 'text-warn', label: 'Warning' },
  box: { icon: Info, bar: 'border-l-line', text: 'text-dim', label: 'Bad box' },
}

export function counts(issues: Issue[]) {
  return { errors: issues.filter((i) => i.level === 'error').length,
    warnings: issues.filter((i) => i.level !== 'error').length }
}

export function Logs({ running, log, last, onGo, onStop, onClose }:
  { running: boolean; log: string; last: BuildDone | null; onGo: (i: Issue) => void; onStop: () => void;
    onClose: () => void }) {
  const issues = last?.issues ?? []
  const [raw, setRaw] = useState(running || !issues.length)
  const end = useRef<HTMLPreElement>(null)
  const { errors, warnings } = counts(issues)
  useEffect(() => { if (raw && running) end.current?.scrollIntoView({ block: 'end' }) }, [log, raw, running])

  return (
    <div className="flex h-full flex-col bg-window">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3 text-[13px]">
        <span className="font-bold">Logs and issues</span>
        {running ? <span className="flex items-center gap-2 text-dim"><Spinner size={13} /> Building…</span>
          : last && <span className={last.ok ? 'text-dim' : 'text-bad'}>
            {last.stopped ? 'Stopped' : last.ok ? `Built in ${last.seconds} s` : 'Build failed'}</span>}
        <span className="flex-1" />
        {running && <Button className="!h-7 text-[13px]" onClick={onStop}><Square size={12} /> Stop</Button>}
        <button aria-label="Back to the PDF" title="Back to the PDF" onClick={onClose}
          className="grid size-7 place-items-center rounded-md hover:bg-hover"><X size={15} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!running && last && (
          <div className="mb-3 flex gap-2 text-[13px]">
            <span className={`rounded-full px-2.5 py-0.5 font-bold ${errors ? 'bg-bad-bg text-bad' : 'bg-pill text-dim'}`}>
              {errors} {errors === 1 ? 'error' : 'errors'}</span>
            <span className={`rounded-full px-2.5 py-0.5 font-bold ${warnings ? 'bg-warn-bg text-warn' : 'bg-pill text-dim'}`}>
              {warnings} {warnings === 1 ? 'warning' : 'warnings'}</span>
          </div>
        )}
        {!running && !last && <p className="py-6 text-center text-[13px] text-dim">Nothing built yet. Press Recompile.</p>}
        <div className="flex flex-col gap-2">
          {issues.map((i, n) => {
            const L = LOOK[i.level]
            return (
              <button key={n} onClick={() => onGo(i)} disabled={!i.line}
                className={`flex gap-2.5 rounded-lg border border-line border-l-4 ${L.bar} bg-card p-2.5 text-left
                  shadow-[var(--shadow-card)] enabled:hover:bg-hover`}>
                <L.icon size={16} className={`mt-0.5 shrink-0 ${L.text}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold [overflow-wrap:anywhere]">{i.message}</div>
                  <div className="text-[12px] text-dim">{L.label}{i.file ? ` · ${i.file}` : ''}{i.line ? `, line ${i.line}` : ''}</div>
                </div>
              </button>
            )
          })}
        </div>
        {(log || running) && (
          <div className="mt-3">
            <button onClick={() => setRaw(!raw)} className="flex items-center gap-1 text-[13px] font-bold text-dim
              hover:text-text"><ChevronRight size={14} className={raw ? 'rotate-90' : ''} /> Raw log</button>
            {raw && <pre ref={end} className="mt-2 max-h-none whitespace-pre-wrap rounded-lg bg-view p-3 font-mono
              text-[11.5px] leading-[17px] select-text [overflow-wrap:anywhere]">{log || ' '}</pre>}
          </div>
        )}
      </div>
    </div>
  )
}
