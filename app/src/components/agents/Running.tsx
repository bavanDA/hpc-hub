// Agents › Running: every agent session on your connected clusters (Claude, ChatGPT, Antigravity, Cursor, Ask all).
// Click one to see it in Terminals, ⋮ to rename or stop it. Start agent opens the same window as a cluster card or
// project. Style E rows, like the phone's Running.
import { Bot, ChevronDown, MessagesSquare, RefreshCw, SquareTerminal, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useGo } from '../../nav'
import { AGENT_NAMES, type TmuxSession } from '../../types/terminals'
import { shortName } from '../clusters/loginCopy'
import { useClusters } from '../clusters/store'
import { EButton, EmptyState, EPage, IconBtn, ItemRow } from '../e/extra'
import { List } from '../e/ui'
import { useListings, useLive } from '../terminals/data'
import { SessionMenu } from '../terminals/SessionMenu'
import { openSession } from '../terminals/tabs'
import { useTools } from '../tools/useTools'
import { Spinner } from '../ui'
import { agentIcon } from './AgentIcon'

const STARTABLE = ['claude', 'codex', 'agy', 'cursor'] as const

/** "Claude · thesis" -> "thesis": the agent's name is on the line below. */
function title(s: TmuxSession): string {
  const t = s.title || s.name
  const agent = `${AGENT_NAMES[s.agent]} · `
  return t.startsWith(agent) ? t.slice(agent.length) : t
}

/** The agent's own logo; Ask all and anything else a plain grey icon. */
const iconOf = (agent: string): LucideIcon => (STARTABLE as readonly string[]).includes(agent) ? agentIcon(agent)
  : agent === 'ask' ? MessagesSquare : SquareTerminal

function StartMenu({ onStart }: { onStart: (cluster: string, name: string, key: string) => void }) {
  const { clusters, sessions } = useClusters()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', away)
    return () => window.removeEventListener('mousedown', away)
  }, [open])
  const up = (clusters ?? []).filter((c) => sessions[c.id]?.connected)
  const where = up.length ? up : clusters ?? []
  return (
    <div ref={box} className="relative">
      <EButton kind="primary" onClick={() => setOpen(!open)} aria-expanded={open}>
        Start agent<ChevronDown size={16} /></EButton>
      {open && (
        <div role="menu" className="menu-in absolute top-full right-0 z-30 mt-1.5 min-w-[240px] rounded-xl bg-raised p-1
          shadow-[var(--shadow-menu)]">
          {where.map((c, n) => (
            <div key={c.id} className={n ? 'mt-1 border-t border-line pt-1' : ''}>
              <div className="px-3 pt-1.5 pb-1 text-xs font-semibold text-dim">{shortName(c)}</div>
              {[...STARTABLE, 'ask'].map((a) => {
                const Icon = iconOf(a)
                return (
                  <button key={a} role="menuitem" onClick={() => { setOpen(false); onStart(c.id, c.name, a === 'ask'
                    ? 'ask' : `agent:${a}`) }}
                    className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-left hover:bg-hover">
                    <Icon size={16} className="shrink-0 text-dim" />
                    {a === 'ask' ? 'Ask all agents' : AGENT_NAMES[a]}</button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
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
