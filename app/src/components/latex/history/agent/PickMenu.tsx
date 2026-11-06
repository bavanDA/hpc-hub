import { Check, ChevronDown } from 'lucide-react'
import { useState } from 'react'

import type { AgentChoice, AgentLevel } from '../../../../types/history'
import { useOutside } from '../../useOutside'
import { AgentIcon } from './AgentIcon'
import { chipLabel } from './labels'
import { Levels } from './Levels'

/** For one question only: another model and effort of your agent, or your usual ones. */
export function PickMenu({ choice, value, onPick }:
  { choice: AgentChoice; value: AgentLevel | null; onPick: (p: AgentLevel | null) => void }) {
  const [open, setOpen] = useState(false)
  const box = useOutside(open, () => setOpen(false))
  const now = { ...choice, ...value }
  const agent = choice.agents.find((a) => a.id === choice.agent)
  const pick = (p: Partial<AgentLevel>) => {
    const next = { model: now.model, effort: now.effort, ...p }
    onPick(next.model === choice.model && next.effort === choice.effort ? null : next)
  }
  return (
    <div ref={box} className="relative shrink-0">
      <button onClick={() => setOpen(!open)} title="The model and effort for this question"
        className="flex h-9 items-center gap-1.5 rounded-lg bg-pill px-2.5 text-sm font-semibold hover:bg-pressed">
        <AgentIcon agent={choice.agent} /> {chipLabel(now, choice.agents)} <ChevronDown size={14} className="text-dim" /></button>
      {open && (
        <div className="menu-in absolute right-0 bottom-full z-30 mb-1.5 w-[420px] rounded-xl border border-line bg-raised
          px-4 pt-3 pb-1.5 font-sans shadow-[var(--shadow-dialog)]">
          <div className="flex items-center gap-2 pb-2.5">
            <span className="min-w-0 flex-1">
              <b className="block text-sm">For this question</b>
              <span className="block text-xs text-dim">{agent?.name ?? choice.agent}. Your usual is
                {` ${chipLabel(choice, choice.agents)}`}.</span>
            </span>
            {value
              ? <button onClick={() => { onPick(null); setOpen(false) }}
                  className="h-8 rounded-md bg-pill px-2.5 text-sm font-semibold hover:bg-pressed">Back to your usual</button>
              : <span className="flex items-center gap-1.5 text-sm text-dim"><Check size={14} /> Your usual</span>}
          </div>
          <Levels agent={agent} value={now} onChange={pick} />
        </div>
      )}
    </div>
  )
}
