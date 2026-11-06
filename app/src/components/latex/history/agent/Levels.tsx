import type { AgentDesc, AgentLevel } from '../../../../types/history'
import { Choices } from './Choices'

/** Model and Effort, each its own choice from what the agent offers; words when it has no such setting. */
export function Levels({ agent, value, onChange }:
  { agent: AgentDesc | undefined; value: AgentLevel; onChange: (p: Partial<AgentLevel>) => void }) {
  const block = 'border-t border-line py-2.5'
  const none = (text: string) => <p className="text-sm text-dim">{text}</p>
  return (
    <>
      <div className={block}>
        <div className="mb-1.5 text-sm">Model</div>
        {agent && agent.models.length > 0
          ? <Choices label="Model" value={value.model} options={agent.models} onChange={(model) => onChange({ model })} />
          : none('Its default model')}
      </div>
      <div className={block}>
        <div className="mb-1.5 text-sm">Effort</div>
        {agent && agent.efforts.length > 0
          ? <Choices label="Effort" value={value.effort} options={agent.efforts} onChange={(effort) => onChange({ effort })} />
          : none('Its default effort')}
      </div>
    </>
  )
}
