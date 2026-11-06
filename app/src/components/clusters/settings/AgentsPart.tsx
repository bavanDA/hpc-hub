import type { AgentId, AgentSettings, Cluster, SettingsInfo } from '../../../types/clusters'
import { agentIcon } from '../../agents/AgentIcon'
import { ChoiceRow } from '../../e/ChoiceRow'
import { Field } from '../../e/Field'
import { Section } from '../../e/Section'
import { ToggleRow } from '../../e/ToggleRow'

export function AgentsPart({ d, agents, up }: {
  d: Cluster; agents: SettingsInfo['agents']; up: (change: Partial<Cluster>) => void
}) {
  const upAgent = (id: AgentId, change: Partial<AgentSettings>) => up({ [id]: { ...d[id]!, ...change } })
  return agents.map((a) => {
    const s = d[a.id]
    if (!s) return null
    return (
      <Section key={a.id} title={a.name} icon={agentIcon(a.id)}>
        <ToggleRow label="Its own compute node" sub={s.new_node ? undefined : 'Runs on the node you have.'}
          checked={s.new_node} onChange={(new_node) => upAgent(a.id, { new_node })} />
        {a.remote_label && <ToggleRow label={a.remote_label} sub={a.remote_hint} checked={s.remote}
          onChange={(remote) => upAgent(a.id, { remote })} />}
        {a.options.map((o) => (
          <ChoiceRow key={o.key} label={o.label} value={String(s[o.key] ?? '')}
            options={o.choices.map(([value, label]) => ({ value, label }))}
            onChange={(x) => upAgent(a.id, { [o.key]: x })} />
        ))}
        <div className="border-b border-line px-5 pb-2">
          <Field label="Folder it starts in" value={s.workdir === '~' ? '' : s.workdir} placeholder="Home folder"
            onChange={(e) => upAgent(a.id, { workdir: e.target.value || '~' })} />
        </div>
      </Section>
    )
  })
}
