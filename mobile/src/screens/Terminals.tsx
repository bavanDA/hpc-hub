// Terminals: your sessions on each connected cluster, the list on its own screen, and the open terminals as tabs with
// the monitoring bar and a row of keys. Everything open stays mounted (App.tsx) and attached, so it keeps running on
// other pages, and a tab that lost its cluster reattaches by itself after sign-in (shared tabs.ts).
import { Plus, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

import { shortName } from '@shared/components/clusters/loginCopy'
import { useListings, useLive, type Live } from '@shared/components/terminals/data'
import { ListNote } from '@shared/components/terminals/ListNote'
import { PanelHead } from '@shared/components/terminals/PanelHead'
import { withOpened } from '@shared/components/terminals/sessionText'
import { tabKey } from '@shared/components/terminals/tabKey'
import { setNotify } from '@shared/components/terminals/tabNotify'
import { select } from '@shared/components/terminals/tabStore'
import type { Tab } from '@shared/components/terminals/tabs'
import { useTabs } from '@shared/components/terminals/useTabs'
import { usePageParams } from '@shared/nav'
import { useBackLayer } from '../nav'
import { Header } from '../parts/Header'
import { KeyBar } from '../parts/terminal/KeyBar'
import { NewTerminalSheet } from '../parts/terminal/NewTerminalSheet'
import { OpenOthers } from '../parts/terminal/OpenTabs'
import { TabBar } from '../parts/terminal/TabBar'
import { TerminalPane } from '../parts/terminal/TerminalPane'
import { TerminalRow } from '../parts/terminal/TerminalRow'
import { IconBtn, useToast } from '../ui'

export function Terminals({ shown }: { shown: boolean }) {
  const toast = useToast()
  useEffect(() => setNotify(toast), [toast])
  const live = useLive()
  const { listings, refresh } = useListings(live)
  const { tabs, current } = useTabs()
  const params = usePageParams()
  const [creating, setCreating] = useState<string | null>(null)  // the cluster a new terminal starts on
  const [startIn, setStartIn] = useState('')  // and its folder, from a project or a paper
  const open = tabs.find((t) => t.key === current)
  const inTerminal = !!open

  // go('terminals', { cluster, new: '1', folder? }) from a cluster card or a project: the New terminal window for that
  // cluster. Each go() brings new params, so the same card button opens it again after it was closed
  useEffect(() => {
    if (shown && params.new && params.cluster) { setStartIn(params.folder ?? ''); setCreating(params.cluster) }
  }, [shown, params])

  // Back from a terminal shows the list first. One effect later than nav.tsx's own layer, so this one is above it.
  const [backToList, setBackToList] = useState(false)
  useEffect(() => setBackToList(shown && inTerminal), [shown, inTerminal])
  useBackLayer(() => { select(null); refresh() }, backToList)

  const newOne = () => {
    if (!live.length) return toast('Connect a cluster first')
    setStartIn('')
    setCreating(live[0].id)
  }

  return (
    <div className="flex h-full flex-col">
      <Header title="Terminals" />
      {inTerminal && <TabBar tabs={tabs} current={current} onChanged={refresh} />}
      <div className="relative min-h-0 flex-1">
        {tabs.map((t) => <TerminalPane key={t.key} tab={t} shown={shown && t.key === current} rail />)}
        {!inTerminal && (
          <div className="absolute inset-0 flex flex-col overflow-y-auto bg-window pb-4">
            <PanelHead title="Sessions">
              <IconBtn icon={RefreshCw} label="Refresh" onClick={refresh} />
              <IconBtn icon={Plus} label="New terminal" iconSize={18} onClick={newOne} />
            </PanelHead>
            {!live.length && <ListNote>Connect a cluster to see its sessions.</ListNote>}
            <OpenOthers tabs={tabs} />
            {live.map((c) => <ClusterSessions key={c.id} cluster={c} listed={listings[c.id]} tabs={tabs}
              onRefresh={refresh} />)}
            <p className="px-4 pt-2 text-sm text-dim">Sessions keep running when you close a tab.</p>
          </div>
        )}
      </div>
      {open && <KeyBar tab={open} />}
      {creating !== null && <NewTerminalSheet live={live} cluster={creating} folder={startIn}
        onClose={() => setCreating(null)} onOpened={() => setTimeout(refresh, 2000)} />}
    </div>
  )
}

function ClusterSessions({ cluster, listed, tabs, onRefresh }: {
  cluster: Live; listed?: ReturnType<typeof useListings>['listings'][string]; tabs: Tab[]; onRefresh: () => void
}) {
  const listing = listed?.listing
  const items = withOpened(listing?.sessions ?? [], tabs, cluster.id)
  return (
    <div className="mb-2">
      <h3 className="border-b border-line px-4 pt-4 pb-1.5 text-xs font-semibold tracking-wide text-dim uppercase">
        {shortName(cluster)}</h3>
      {!listing && listed?.error && <ListNote>{listed.error}</ListNote>}
      {!listing && !listed?.error && !items.length && <ListNote>Loading…</ListNote>}
      {listing && !listing.has_tmux && !items.length && <ListNote>tmux is not installed here.</ListNote>}
      {listing && listing.has_tmux && !items.length && <ListNote>No sessions yet.</ListNote>}
      {items.map((s) => (
        <TerminalRow key={s.name} cluster={cluster.id} s={s} nodes={listing?.nodes ?? null} onRefresh={onRefresh}
          open={tabs.some((t) => t.key === tabKey(cluster.id, s.name))} />
      ))}
    </div>
  )
}
