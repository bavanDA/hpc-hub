// Terminals: your tmux sessions on each connected cluster; one opens full screen with a key row and the
// monitoring bar. Open terminals live in the shared tabs store, so they keep running on other screens.
// Tap a session to open it, press and hold (or ⋮) to rename, recolor or stop it.
import { Plus, RefreshCw, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useListings, useLive } from '@shared/components/terminals/data'
import { openSession, select, setNotify, tabKey, useTabs } from '@shared/components/terminals/tabs'
import { EmptyState } from '@shared/components/ui'
import { usePageParams } from '@shared/nav'
import type { TmuxSession } from '@shared/types/terminals'
import { Header } from '../parts/Header'
import { NewTerminalSheet } from '../parts/terminal/NewTerminalSheet'
import { OpenChips } from '../parts/terminal/OpenTabs'
import { SessionActions, type Target } from '../parts/terminal/SessionActions'
import { SessionRow } from '../parts/terminal/SessionRow'
import { TerminalScreen } from '../parts/TerminalScreen'
import { Button, useToast } from '../ui'

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
  useEffect(() => {
    if (shown && params.new && params.cluster) setCreating(params.cluster)
  }, [shown, params.new, params.cluster])

  if (open) return <TerminalScreen tab={open} shown={shown} onChanged={refresh}
    onBack={() => { select(null); refresh() }} />

  const sessionsOf = (id: string): TmuxSession[] => {
    const listed = [...(listings[id]?.listing?.sessions ?? [])]
    // just started here, not listed yet
    for (const t of tabs) {
      if (t.cluster === id && t.session && !listed.some((s) => s.name === t.session)) {
        listed.unshift({ name: t.session, kind: t.kind, created: 0, attached: 1, label: t.title, color: t.color,
          command: '', windows: 1, path: '', remote: '', node: t.node, title: t.title, agent: 'term', job: '' })
      }
    }
    return listed
  }

  return (
    <div className="flex h-full flex-col">
      <Header title="Terminals">
        {live.length > 0 && <button aria-label="Refresh" onClick={refresh}
          className="grid size-12 place-items-center rounded-full active:bg-hover"><RefreshCw size={22} /></button>}
        {live.length > 0 && <button aria-label="New terminal" onClick={() => setCreating(live[0].id)}
          className="grid size-12 place-items-center rounded-full active:bg-hover"><Plus size={24} /></button>}
      </Header>
      {!live.length && <EmptyState icon={WifiOff} title="Not connected" text="Connect a cluster to open terminals." />}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <OpenChips tabs={tabs} current={current} />
        {live.map((c) => {
          const l = listings[c.id]
          const sessions = sessionsOf(c.id)
          return (
            <section key={c.id} className="mb-5">
              <h2 className="mb-2 text-sm font-bold text-dim">{c.name}{c.node ? ` · node ${c.node}` : ''}</h2>
              {l?.error && <p className="mb-2 rounded-xl bg-bad-bg p-3 text-bad">{l.error}</p>}
              {l?.listing && !l.listing.has_tmux && !sessions.length &&
                <p className="mb-2 text-sm text-dim">tmux is not installed here.</p>}
              {l?.listing && l.listing.has_tmux && !sessions.length &&
                <p className="mb-2 text-sm text-dim">No sessions yet.</p>}
              <div className="flex flex-col gap-2">
                {sessions.map((s) => (
                  <SessionRow key={s.name} s={s} nodes={l?.listing?.nodes ?? null}
                    open={tabs.some((t) => t.key === tabKey(c.id, s.name))}
                    onOpen={() => openSession(c.id, s)}
                    onActions={() => setActing({ cluster: c.id, name: s.name, kind: s.kind, node: s.node,
                      title: s.title || s.name })} />
                ))}
              </div>
              <Button icon={Plus} className="mt-2 w-full" onClick={() => setCreating(c.id)}>New terminal</Button>
            </section>
          )
        })}
        {live.length > 0 && <p className="text-sm text-dim">Sessions keep running when you leave them.
          Press and hold one to rename, recolor or stop it.</p>}
      </div>
      {creating !== null && <NewTerminalSheet live={live} cluster={creating} onClose={() => setCreating(null)}
        onOpened={() => setTimeout(refresh, 2000)} />}
      {acting && <SessionActions target={acting} onClose={() => setActing(null)} onChanged={refresh} />}
    </div>
  )
}
