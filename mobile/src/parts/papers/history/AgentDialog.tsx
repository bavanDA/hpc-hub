// The agent's model and effort for a paper, from the chip by the branch name, and the one-question version from the
// Ask box: the desktop's Levels (a dropdown each, the label above).
import { X } from 'lucide-react'

import { AgentIcon } from '@shared/components/latex/history/agent/AgentIcon'
import { chipLabel } from '@shared/components/latex/history/agent/labels'
import { Levels } from '@shared/components/latex/history/agent/Levels'
import type { AgentChoice, AgentLevel } from '@shared/types/history'
import { usePhoneNav } from '../../../nav'
import { Button, Dialog, ToggleRow } from '../../../ui'

export function AgentDialog({ choice, clusterName, installed, onChoose, onClose }: {
  choice: AgentChoice; clusterName: string; installed: string[] | null
  onChoose: (p: Partial<AgentLevel> & { split?: boolean }) => void; onClose: () => void
}) {
  const { setSettings } = usePhoneNav()
  const agent = choice.agents.find((a) => a.id === choice.agent)
  const missing = !!installed && !installed.includes(choice.agent)
  return (
    <Dialog title="Agent" width={460} onClose={onClose}>
      <p className="px-5 pb-3 text-sm text-dim">Writes commit messages, answers questions about changes and checks your
        notes. Kept for every paper.</p>
      <div className="flex min-h-11 items-center gap-3 border-t border-line px-5">
        <AgentIcon agent={choice.agent} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{agent?.name ?? choice.agent}</span>
          {missing && <span className="block text-xs text-dim">Not found on {clusterName}</span>}
        </span>
        <button onClick={() => { onClose(); setSettings(true) }}
          className="h-8 rounded-md px-2 text-sm text-dim underline underline-offset-2 active:bg-pressed">Change in Settings</button>
      </div>
      <div className="px-5"><Levels agent={agent} value={choice} onChange={onChoose} /></div>
      <div className="border-t border-line">
        <ToggleRow label="Suggest several commits" checked={choice.split} onChange={(split) => onChoose({ split })} />
      </div>
      <p className="px-5 pt-2 text-xs text-dim">Runs on your compute node on {clusterName}.</p>
    </Dialog>
  )
}

/** For one question only: another model and effort of your agent, or your usual ones. */
export function QuestionLevels({ choice, value, onPick, onClose }: { choice: AgentChoice; value: AgentLevel | null
  onPick: (p: AgentLevel | null) => void; onClose: () => void }) {
  const now = { ...choice, ...value }
  const agent = choice.agents.find((a) => a.id === choice.agent)
  const pick = (p: Partial<AgentLevel>) => {
    const next = { model: now.model, effort: now.effort, ...p }
    onPick(next.model === choice.model && next.effort === choice.effort ? null : next)
  }
  return (
    <Dialog title="For this question" width={420} onClose={onClose}>
      <p className="px-5 pb-2 text-sm text-dim">{agent?.name ?? choice.agent}. Your usual is {chipLabel(choice, choice.agents)}.</p>
      <div className="px-5"><Levels agent={agent} value={now} onChange={pick} /></div>
      {value && <div className="px-5 pt-2"><Button className="w-full" onClick={() => { onPick(null); onClose() }}><X size={16} /> Back to your usual</Button></div>}
    </Dialog>
  )
}
