import { Bot, RefreshCw } from 'lucide-react'

import { useGo } from '../../nav'
import { AGENT_NAMES, type TmuxSession } from '../../types/terminals'
import { shortName } from '../clusters/loginCopy'
import { EmptyState } from '../e/EmptyState'
import { EPage } from '../e/EPage'
import { IconBtn } from '../e/IconBtn'
import { ItemRow } from '../e/ItemRow'
import { List } from '../e/List'
import { useListings, useLive } from '../terminals/data'
import { SessionMenu } from '../terminals/SessionMenu'
import { openSession } from '../terminals/tabs'
import { useTools } from '../tools/useTools'
import { Spinner } from '../ui/Spinner'
import { iconOf } from './startable'
import { StartMenu } from './StartMenu'

/** "Claude · thesis" -> "thesis": the agent's name is on the line below. */
function title(s: TmuxSession): string {
  const t = s.title || s.name
  const agent = `${AGENT_NAMES[s.agent]} · `
  return t.startsWith(agent) ? t.slice(agent.length) : t
}

export function Running() {
  const live = useLive()
  const { listings, refresh } = useListings(live)
  const tools = useTools()
  const go = useGo()
  const rows: { cluster: string; name: string; s: TmuxSession }[] = []
  for (const c of live) {
    for (const s of listings[c.id]?.listing?.sessions ?? []) {
      if (s.agent && s.agent !== 'term' && AGENT_NAMES[s.agent]) rows.push({ cluster: c.id, name: shortName(c), s })
    }
  }
  const loading = live.some((c) => !listings[c.id])

  return (
    <EPage note={live.length ? '' : 'Connect a cluster to see its agents.'} actions={<>
      {loading && <Spinner />}
      <IconBtn icon={RefreshCw} label="Refresh" onClick={refresh} />
      <StartMenu onStart={(cluster, name, key) => tools.open(cluster, name, key)} />
    </>}>
      {!rows.length && !loading && <EmptyState icon={Bot} title="No agents running"
        text="An agent runs on a compute node and keeps going when you close the app." />}
      {!!rows.length && (
        <List>
          {rows.map(({ cluster, name, s }) => (
            <ItemRow key={`${cluster}/${s.name}`} icon={iconOf(s.agent)} label={title(s)}
              onPress={() => { openSession(cluster, s); go('terminals') }}
              sub={[AGENT_NAMES[s.agent], name, s.node, s.attached ? 'open elsewhere' : ''].filter(Boolean)
                .join(' · ')}
              trailing={<SessionMenu target={{ cluster, name: s.name, kind: s.kind, node: s.node, title: s.title }}
                onChanged={refresh} />} />
          ))}
        </List>
      )}
      {tools.dialog}
    </EPage>
  )
}
