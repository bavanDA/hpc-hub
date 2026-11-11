// The Ask box on the phone: what the question is about, the question, Ask. The small chip below picks another model
// or effort for this one question.
import { ArrowUp, ChevronDown, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { chipLabel } from '@shared/components/latex/history/agent/labels'
import type { AgentChoice, AgentLevel } from '@shared/types/history'
import { Button } from '../../../ui'
import { QuestionLevels } from './AgentDialog'

export function AskBox({ title, choice, onAsk, onClose }: { title: ReactNode; choice: AgentChoice | null
  onAsk: (question: string, pick: AgentLevel | null) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [pick, setPick] = useState<AgentLevel | null>(null)
  const [levels, setLevels] = useState(false)
  const go = () => { if (q.trim()) onAsk(q.trim(), pick) }
  return (
    <div className="my-2.5 rounded-xl border-2 border-text bg-window px-3.5 pt-2.5 pb-2 select-none">
      <div className="flex items-center gap-2 text-sm">
        <span className="size-[18px] shrink-0 rounded-full border border-dashed border-line-strong" />
        <span className="min-w-0 flex-1 truncate"><b>Ask about</b> <span className="text-dim">{title}</span></span>
        <button onClick={onClose} aria-label="Close" className="grid size-7 place-items-center rounded-md text-dim active:bg-pressed">
          <X size={14} /></button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about this change"
          aria-label="Your question" onKeyDown={(e) => e.key === 'Enter' && go()}
          className="h-10 min-w-0 flex-1 rounded-lg bg-soft px-3 outline-none placeholder:text-faint focus:ring-1 focus:ring-accent" />
        <Button kind="primary" icon={ArrowUp} disabled={!q.trim()} onClick={go}>Ask</Button>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <p className="min-w-0 flex-1 text-xs text-dim">Answers appear here while you keep reading.</p>
        {choice && <button onClick={() => setLevels(true)}
          className="flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-semibold active:bg-pressed">
          {chipLabel({ ...choice, ...pick }, choice.agents)} <ChevronDown size={12} className="text-dim" /></button>}
      </div>
      {levels && choice && <QuestionLevels choice={choice} value={pick} onPick={setPick} onClose={() => setLevels(false)} />}
    </div>
  )
}
