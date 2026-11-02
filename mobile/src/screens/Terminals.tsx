// Terminals: your tmux sessions on each connected cluster; one opens full screen with a key row and the
// monitoring bar. Open terminals live in the shared tabs store, so they keep running on other screens.
// Tap a session to open it, press and hold (or ⋮) to rename or stop it. Each cluster's heading names its node,
// so the rows only say where a session runs when it's somewhere else.
import { Plus, RefreshCw, SquareTerminal, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useListings, useLive } from '@shared/components/terminals/data'
import { openSession, select, setNotify, tabKey, useTabs } from '@shared/components/terminals/tabs'
import { usePageParams } from '@shared/nav'
import type { TmuxSession } from '@shared/types/terminals'
import { Header } from '../parts/Header'
import { NewTerminalSheet } from '../parts/terminal/NewTerminalSheet'
import { OpenOthers } from '../parts/terminal/OpenTabs'
import { SessionActions, type Target } from '../parts/terminal/SessionActions'
import { SessionRow } from '../parts/terminal/SessionRow'
import { TerminalScreen } from '../parts/TerminalScreen'
import { EmptyState, List, MainButton, useToast } from '../ui'

const short = (name: string) => name.split(' (')[0]

export function Terminals({ shown }: { shown: boolean }) {
  const toast = useToast()
  useEffect(() => setNotify(toast), [toast])
  const live = useLive()
  const { listings, refresh } = useListings(live)
  const { tabs, current } = useTabs()
  const params = usePageParams()
  const [creating, setCreating] = useState<string | null>(null)  // the cluster a new terminal starts on
  const [acting, setActing] = useState<Target | null>(null)
  const open = tabs.find((t) => t.key === current)

  // go('terminals', { cluster, new: '1' }) from a cluster card: the New terminal sheet for that cluster
  // each go() brings new params, so the same card button opens the sheet again after it was closed
  useEffect(() => {
    if (shown && params.new && params.cluster) setCreating(params.cluster)
  }, [shown, params])

  if (open) return <TerminalScreen tab={open} shown={shown} onChanged={refresh}
    onBack={() => { select(null); refresh() }} />

  const sessionsOf = (id: string): TmuxSession[] => {
    const listed = [...(listings[id]?.listing?.sessions ?? [])]
    // just started here, not listed yet
    for (const t of tabs) {
      if (t.cluster === id && t.session && !listed.some((s) => s.name === t.session)) {
        listed.unshift({ name: t.session, kind: t.kind, created: 0, attached: 1, label: t.title, color: '',
          command: '', windows: 1, path: '', remote: '', node: t.node, title: t.title, agent: 'term', job: '' })
      }
    }
    return listed
  }
  const none = live.length > 0 && live.every((c) => listings[c.id]?.listing && !sessionsOf(c.id).length)

  return (
    <div className="flex h-full flex-col">
      <Header title="Terminals">
        {live.length > 0 && <button aria-label="Refresh" onClick={refresh}
          className="grid size-12 place-items-center rounded-full active:bg-pressed"><RefreshCw size={22} /></button>}
        {live.length > 0 && <button aria-label="New terminal" onClick={() => setCreating(live[0].id)}
          className="grid size-12 place-items-center rounded-full active:bg-pressed"><Plus size={24} /></button>}
      </Header>
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {!live.length && <EmptyState icon={WifiOff} title="Not connected" text="Connect a cluster to open terminals." />}
        {none && <EmptyState icon={SquareTerminal} title="No terminals yet"
          text="A terminal keeps running when you leave it or close the app."
          action={<MainButton icon={Plus} className="px-6" onClick={() => setCreating(live[0].id)}>New terminal</MainButton>} />}
        <OpenOthers tabs={tabs} />
        {!none && live.map((c) => {
          const l = listings[c.id]
          const sessions = sessionsOf(c.id)
          return (
            <section key={c.id} className="pt-5">
              <h2 className="px-4 pb-1.5 text-sm font-semibold text-dim">
                {short(c.name)}{c.node ? ` · ${c.node}` : ''}</h2>
              {l?.error && <p className="px-4 pb-2 text-bad">{l.error}</p>}
              {l?.listing && !l.listing.has_tmux && !sessions.length &&
                <p className="px-4 pb-2 text-dim">tmux isn't installed on {short(c.name)}.</p>}
              {l?.listing && l.listing.has_tmux && !sessions.length &&
                <p className="px-4 pb-2 text-dim">No sessions yet.</p>}
              {sessions.length > 0 && (
                <List>
                  {sessions.map((s) => (
                    <SessionRow key={s.name} s={s} nodes={l?.listing?.nodes ?? null} here={c.node}
                      open={tabs.some((t) => t.key === tabKey(c.id, s.name))}
                      onOpen={() => openSession(c.id, s)}
                      onActions={() => setActing({ cluster: c.id, name: s.name, kind: s.kind, node: s.node,
                        title: s.title || s.name })} />
                  ))}
                </List>
              )}
            </section>
          )
        })}
        {live.length > 0 && !none && <p className="px-4 pt-3 text-sm text-dim">Sessions keep running when you leave
          them. Press and hold one to rename or stop it.</p>}
      </div>
      {creating !== null && <NewTerminalSheet live={live} cluster={creating} onClose={() => setCreating(null)}
        onOpened={() => setTimeout(refresh, 2000)} />}
      {acting && <SessionActions target={acting} onClose={() => setActing(null)} onChanged={refresh} />}
    </div>
  )
}
