import { ArrowUp, X } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import type { AgentChoice, AgentLevel } from '../../../../types/history'
import { Button } from '../../../ui/Button'
import { chipLabel } from '../agent/labels'
import { PickMenu } from '../agent/PickMenu'

type BoxProps = {
  title: ReactNode  // Ask about the selected text "…"
  choice: AgentChoice | null
  onAsk: (question: string, pick: AgentLevel | null) => void
  onClose: () => void
  className?: string
}

export function AskBox({ title, choice, onAsk, onClose, className = 'mx-12 my-2' }: BoxProps) {
  const [q, setQ] = useState('')
  const [pick, setPick] = useState<AgentLevel | null>(null)
  const go = () => { if (q.trim()) onAsk(q.trim(), pick) }
  return (
    <div className={`${className} rounded-xl border-2 border-text bg-window px-3.5 pt-2.5 pb-2 font-sans text-base select-none`}>
      <div className="flex items-center gap-2 text-sm">
        <span className="size-[18px] rounded-full border border-dashed border-line-strong" />
        <span className="min-w-0 flex-1 truncate"><b>Ask about</b> <span className="text-dim">{title}</span></span>
        <button onClick={onClose} aria-label="Close" className="grid size-7 place-items-center rounded-md text-dim hover:bg-hover">
          <X size={14} /></button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about this change"
          aria-label="Your question" onKeyDown={(e) => { if (e.key === 'Enter') go(); if (e.key === 'Escape') onClose() }}
          className="h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-window px-3 outline-none
            placeholder:text-faint focus:border-accent focus:ring-1 focus:ring-accent" />
        {choice && <PickMenu choice={choice} value={pick} onPick={setPick} />}
        <Button kind="primary" disabled={!q.trim()} onClick={go}><ArrowUp size={15} /> Ask</Button>
      </div>
      <p className="mt-1.5 text-xs text-dim">Answers appear here while you keep reading.{pick && choice
        ? ` This question uses ${chipLabel({ ...choice, ...pick }, choice.agents)}; your usual stays ${chipLabel(choice, choice.agents)}.` : ''}</p>
    </div>
  )
}
