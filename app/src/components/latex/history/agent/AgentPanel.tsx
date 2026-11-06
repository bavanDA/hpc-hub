import { X } from 'lucide-react'

import type { AgentChoice } from '../../../../types/history'
import { openSettings } from '../../../app/openSettings'
import { Switch } from '../../../ui/Switch'

import type { ChipProps } from './AgentChip'
import { AgentIcon } from './AgentIcon'
import { Levels } from './Levels'

export function AgentPanel({ choice, clusterName, installed, onChoose, onClose }:
  { choice: AgentChoice; clusterName: string; installed: string[] | null
    onChoose: ChipProps['onChoose']; onClose: () => void }) {
  const agent = choice.agents.find((a) => a.id === choice.agent)
  const missing = !!installed && !installed.includes(choice.agent)
  return (
    <div className="menu-in absolute bottom-full left-0 z-30 mb-2 w-[460px] rounded-xl border border-line bg-raised px-[18px]
      pt-4 pb-3.5 shadow-[var(--shadow-dialog)]">
      <div className="flex items-center"><b className="flex-1 text-[15px]">Agent</b>
        <button onClick={onClose} aria-label="Close" className="grid size-7 place-items-center rounded-md text-dim hover:bg-hover">
          <X size={15} /></button></div>
      <p className="mt-0.5 mb-3 text-[13px] leading-[18px] text-dim">Writes commit messages, answers questions about
        changes and checks your notes. Kept for every paper.</p>
      <div className="flex min-h-11 items-center gap-3 border-t border-line">
        <AgentIcon agent={choice.agent} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{agent?.name ?? choice.agent}</span>
          {missing && <span className="block text-xs text-dim">Not found on {clusterName}</span>}
        </span>
        <button onClick={() => { onClose(); openSettings() }}
          className="h-8 rounded-md px-2 text-sm text-dim underline underline-offset-2 hover:bg-hover hover:text-text">
          Change in Settings</button>
      </div>
      <Levels agent={agent} value={choice} onChange={onChoose} />
      <div className="flex min-h-11 items-center gap-3 border-t border-line"><span className="flex-1">Suggest several commits</span>
        <Switch on={choice.split} onChange={(split) => onChoose({ split })} label="Suggest several commits" /></div>
      <p className="mt-1 text-xs leading-4 text-dim">Runs on your compute node on {clusterName}.</p>
    </div>
  )
}
