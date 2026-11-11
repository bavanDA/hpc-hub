import type { AgentDesc, AgentLevel } from '../../../../types/history'
import { SelectField } from '../../../e/SelectField'

/** Model and Effort, each its own choice from what the agent offers; words when it has no such setting. */
export function Levels({ agent, value, onChange }:
  { agent: AgentDesc | undefined; value: AgentLevel; onChange: (p: Partial<AgentLevel>) => void }) {
  const level = (label: string, options: [string, string][] | undefined, picked: string, pick: (v: string) => void, none: string) => (
    <div className="border-t border-line py-1">
      {options?.length ? <SelectField label={label} value={picked} options={options} onChange={pick} />
        : <><div className="pt-1.5 text-sm text-dim">{label}</div><p className="pb-1.5 text-sm">{none}</p></>}
    </div>
  )
  return (
    <>
      {level('Model', agent?.models, value.model, (model) => onChange({ model }), 'Its default model')}
      {level('Effort', agent?.efforts, value.effort, (effort) => onChange({ effort }), 'Its default effort')}
    </>
  )
}
