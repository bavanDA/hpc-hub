// "Start agent": which cluster (skipped when only one is connected), then what to start there.
import { Code, MessagesSquare } from 'lucide-react'
import { useRef, useState } from 'react'

import { shortName } from '@shared/components/clusters/loginCopy'
import { agentIcon } from '@shared/components/agents/AgentIcon'
import { useClusters } from '@shared/components/clusters/store'
import { AGENT_NAMES } from '@shared/types/terminals'
import { ActionSheet, PickerSheet } from '../../ui'

const AGENTS = ['claude', 'codex', 'agy', 'cursor'] as const

export function StartPicker({ onStart, onClose }:
  { onStart: (cluster: string, name: string, key: string) => void; onClose: () => void }) {
  const { clusters, sessions } = useClusters()
  const up = (clusters ?? []).filter((c) => sessions[c.id]?.connected)
  const where = up.length ? up : clusters ?? []
  const [cluster, setCluster] = useState(where.length === 1 ? where[0] : null)
  const picked = useRef(false)  // a pick closes the picker first; don't close the whole flow then

  if (!cluster) return (
    <PickerSheet title="Start an agent on" onClose={() => queueMicrotask(() => { if (!picked.current) onClose() })}
      options={where.map((c) => ({ value: c.id, label: shortName(c),
        hint: sessions[c.id]?.connected ? 'Connected' : 'Connects first' }))}
      onPick={(id) => { picked.current = true; setCluster(where.find((c) => c.id === id) ?? null) }} />
  )
  const go = (key: string) => onStart(cluster.id, cluster.name, key)
  return (
    <ActionSheet title={`Start on ${shortName(cluster)}`} onClose={onClose} actions={[
      ...AGENTS.map((a) => ({ label: AGENT_NAMES[a], icon: agentIcon(a), onPick: () => go(`agent:${a}`) })),
      { label: 'Ask all agents', icon: MessagesSquare, onPick: () => go('ask') },
      { label: 'VS Code in the browser', icon: Code, onPick: () => go('vscode') },
    ]} />
  )
}
