import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

import type { AgentChoice, AgentLevel } from '../../../../types/history'
import { useOutside } from '../../useOutside'
import { AgentIcon } from './AgentIcon'
import { AgentPanel } from './AgentPanel'
import { chipLabel } from './labels'

export type ChipProps = {
  choice: AgentChoice | null
  clusterName: string
  installed: string[] | null
  onOpen: () => void  // look up which agents the cluster has
  onChoose: (p: Partial<AgentLevel> & { split?: boolean }) => void
}

/** The chip in the bar under the commit list, and its panel. */
export function AgentChip({ choice, clusterName, installed, onOpen, onChoose }: ChipProps) {
  const [open, setOpen] = useState(false)
  const box = useOutside(open, () => setOpen(false))
  if (!choice) return null
  return (
    <div ref={box} className="relative shrink-0">
      <button onClick={() => { if (!open) onOpen(); setOpen(!open) }} title="The model and effort for Write message, Ask and Check my list"
        className={`flex h-8 items-center gap-1.5 rounded-md px-1.5 text-sm font-semibold ${open ? 'bg-selected' : 'hover:bg-hover'}`}>
        <AgentIcon agent={choice.agent} /> <span className="max-w-[140px] truncate">{chipLabel(choice, choice.agents)}</span>
        {open ? <ChevronDown size={13} className="text-dim" /> : <ChevronUp size={13} className="text-dim" />}</button>
      {open && <AgentPanel choice={choice} clusterName={clusterName} installed={installed} onChoose={onChoose}
        onClose={() => setOpen(false)} />}
    </div>
  )
}
