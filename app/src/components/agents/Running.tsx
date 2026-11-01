// Agents › Running: every agent session on your connected clusters (Claude, ChatGPT, Antigravity, Cursor, Ask all),
// with Open to see it in Terminals. Start agent opens the same dialog as a cluster card or project.
import { Bot, ChevronDown, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useGo } from '../../nav'
import { AGENT_NAMES, type TmuxSession } from '../../types/terminals'
import { useClusters } from '../clusters/store'
import { useListings, useLive } from '../terminals/data'
import { Dot } from '../terminals/Popover'
import { SessionMenu } from '../terminals/SessionMenu'
import { openSession } from '../terminals/tabs'
import { useTools } from '../tools/useTools'
import { Button, EmptyState, IconButton, List, Spinner } from '../ui'

const STARTABLE = ['claude', 'codex', 'agy', 'cursor'] as const

/** "Claude · thesis" -> "thesis": the agent's name is on the line below. */
function title(s: TmuxSession): string {
  const t = s.title || s.name
  const agent = `${AGENT_NAMES[s.agent]} · `
  return t.startsWith(agent) ? t.slice(agent.length) : t
}

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
      <Button kind="primary" onClick={() => setOpen(!open)} aria-expanded={open}>
        Start agent<ChevronDown size={16} /></Button>
      {open && (
        <div role="menu" className="menu-in absolute top-full right-0 z-30 mt-1.5 min-w-[240px] rounded-xl bg-raised p-1
          shadow-[var(--shadow-menu)]">
          {where.map((c, n) => (
            <div key={c.id} className={n ? 'mt-1 border-t border-line pt-1' : ''}>
              <div className="px-3 pt-1.5 pb-1 text-xs font-semibold text-dim">{c.name}</div>
              {[...STARTABLE, 'ask'].map((a) => (
                <button key={a} role="menuitem" onClick={() => { setOpen(false); onStart(c.id, c.name, a === 'ask'
                  ? 'ask' : `agent:${a}`) }}
                  className="flex h-9 w-full items-center rounded-md px-3 text-left hover:bg-hover">
                  {a === 'ask' ? 'Ask all agents…' : `${AGENT_NAMES[a]}…`}</button>
              ))}
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
      if (s.agent && s.agent !== 'term' && AGENT_NAMES[s.agent]) rows.push({ cluster: c.id, name: c.name, s })
    }
  }
  const loading = live.some((c) => !listings[c.id])

  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-4 px-4 py-6">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-dim">
          {live.length ? `On ${live.map((c) => c.name).join(' and ')}` : 'Connect a cluster to see its agents.'}</p>
        {loading && <Spinner />}
        <IconButton icon={RefreshCw} label="Refresh" onClick={refresh} />
        <StartMenu onStart={(cluster, name, key) => tools.open(cluster, name, key)} />
      </div>
      {!rows.length && !loading && (
        <div className="h-[50vh]">
          <EmptyState icon={Bot} title="No agents running"
            text="An agent runs on a compute node and keeps going when you close the app." />
        </div>
      )}
      {!!rows.length && (
        <List>
          {rows.map(({ cluster, name, s }) => (
            <div key={`${cluster}/${s.name}`} className="flex items-center gap-3 px-4 py-2.5">
              <Dot color={s.color} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{title(s)}</div>
                <div className="truncate text-sm text-dim">
                  {[AGENT_NAMES[s.agent], name, s.node, s.attached ? 'open elsewhere' : ''].filter(Boolean)
                    .join(' · ')}</div>
              </div>
              <Button size="sm" onClick={() => { openSession(cluster, s); go('terminals') }}>Open</Button>
              <SessionMenu target={{ cluster, name: s.name, kind: s.kind, node: s.node, title: s.title }}
                onChanged={refresh} />
            </div>
          ))}
        </List>
      )}
      {tools.dialog}
    </div>
  )
}
