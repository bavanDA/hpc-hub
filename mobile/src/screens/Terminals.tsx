// Terminals: your tmux sessions on each connected cluster; one opens full screen with a key row and the
// monitoring bar. Open terminals live in the shared tabs store, so they keep running on other screens.
import { Plus, RefreshCw, SquareTerminal, WifiOff } from 'lucide-react'
import { useEffect } from 'react'

import { useListings, useLive } from '@shared/components/terminals/data'
import { openNew, openSession, select, setNotify, useTabs } from '@shared/components/terminals/tabs'
import { EmptyState } from '@shared/components/ui'
import { Header } from '../parts/Header'
import { TerminalScreen } from '../parts/TerminalScreen'
import { Button, useToast } from '../ui'

export function Terminals({ shown }: { shown: boolean }) {
  const toast = useToast()
  useEffect(() => setNotify(toast), [toast])
  const live = useLive()
  const { listings, refresh } = useListings(live)
  const { tabs, current } = useTabs()
  const open = tabs.find((t) => t.key === current)

  async function newTerminal(cluster: string, node: string) {
    try {
      await openNew(cluster, { name: 'Terminal', node: !!node, folder: '', color: '' })
      setTimeout(refresh, 2000)
    } catch (e) {
      toast((e as Error).message)
    }
  }

  if (open) return <TerminalScreen tab={open} shown={shown} onBack={() => { select(null); refresh() }} />
  return (
    <div className="flex h-full flex-col">
      <Header title="Terminals">
        {live.length > 0 && <button aria-label="Refresh" onClick={refresh}
          className="grid size-12 place-items-center rounded-full active:bg-hover"><RefreshCw size={22} /></button>}
      </Header>
      {!live.length && <EmptyState icon={WifiOff} title="Not connected" text="Connect a cluster to open terminals." />}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {live.map((c) => {
          const l = listings[c.id]
          const sessions = l?.listing?.sessions ?? []
          return (
            <section key={c.id} className="mb-5">
              <h2 className="mb-2 text-sm font-bold text-dim">{c.name}{c.node ? ` · node ${c.node}` : ''}</h2>
              {l?.error && <p className="mb-2 rounded-xl bg-bad-bg p-3 text-bad">{l.error}</p>}
              <div className="flex flex-col gap-2">
                {sessions.map((s) => {
                  const isOpen = tabs.some((t) => t.key === `${c.id}/${s.name}`)
                  return (
                    <button key={s.name} onClick={() => openSession(c.id, s)}
                      className="flex items-center gap-3 rounded-2xl bg-card p-4 text-left shadow-[var(--shadow-card)]
                        active:bg-hover">
                      <span className="size-3 shrink-0 rounded-full" style={{ background: s.color || 'var(--color-dim)' }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{s.title}</span>
                        <span className="block truncate text-sm text-dim">
                          {[s.node || 'login node', s.agent, isOpen ? 'open' : ''].filter(Boolean).join(' · ')}</span>
                      </span>
                      <SquareTerminal size={20} className="text-dim" />
                    </button>
                  )
                })}
              </div>
              <Button icon={Plus} className="mt-2 w-full" onClick={() => newTerminal(c.id, c.node)}>
                New terminal{c.node ? ' on the node' : ''}</Button>
            </section>
          )
        })}
      </div>
    </div>
  )
}
