import { CircleAlert, CircleCheck, Loader2 } from 'lucide-react'

import type { Step } from '../../../../types/history'

export function Steps({ steps, todo = [], stopped }: { steps: Step[]; todo?: string[]; stopped?: string }) {
  return (
    <ol className="flex flex-col gap-1.5">
      {steps.map((s, i) => (
        <li key={i} className="flex items-center gap-3">
          {s.done ? <CircleCheck size={18} className="shrink-0 fill-text text-window" />
            : <Loader2 size={18} className="shrink-0 animate-spin text-dim" />}
          <span className={`min-w-0 flex-1 ${!s.done ? 'font-semibold' : ''}`}>{s.label}</span>
          {s.done && <span className="w-14 shrink-0 text-right text-sm tabular-nums text-dim">{s.seconds} s</span>}
        </li>
      ))}
      {stopped && <li className="flex items-center gap-3 font-semibold">
        <CircleAlert size={18} className="shrink-0 fill-orange text-window" /> {stopped}</li>}
      {todo.map((t) => (
        <li key={t} className="flex items-center gap-3 text-faint">
          <span className="size-[18px] shrink-0 rounded-full border-2 border-line-strong" /> {t}</li>
      ))}
    </ol>
  )
}
