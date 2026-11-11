// One side of a Globus transfer, the desktop's pane on a phone: a tap selects a row, a second tap on a folder opens
// it (the desktop's double click). The folder menu and New folder answer Android's Back.
import { ArrowUp, Bookmark, CircleAlert, FolderOpen, FolderPlus, FolderSearch, HardDrive, Home, KeyRound, RefreshCw,
  WifiOff } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import { shortName } from '@shared/components/clusters/loginCopy'
import { join, parent } from '@shared/components/files/format'
import { ItemRow } from '@shared/components/globus/ItemRow'
import { NewFolder } from '@shared/components/globus/NewFolder'
import { PaneEmpty } from '@shared/components/globus/PaneEmpty'
import { usePlaces } from '@shared/components/globus/places'
import type { Pane as PaneState } from '@shared/components/globus/usePane'
import { Spinner } from '@shared/components/ui/Spinner'
import { call } from '@shared/rpc'
import type { GlobusCluster, Item } from '@shared/types/globus'
import { BackLayer, IconBtn, Menu, useToast } from '../../ui'
import { Choice } from '../Choice'

const ICON = 'grid size-9 shrink-0 place-items-center rounded-md text-dim active:bg-pressed'

export function Pane({ pane, clusters, onChoose, onConsent, onStart }: {
  pane: PaneState; clusters: GlobusCluster[]; onChoose: (c: GlobusCluster) => void; onConsent: () => void
  onStart: (c: GlobusCluster) => Promise<void>
}) {
  const toast = useToast()
  const [location, setLocation] = useState('')
  const [naming, setNaming] = useState(false)
  const { places, projects } = usePlaces(pane.cluster)
  const cfg = clusters.find((c) => c.id === pane.cluster)
  const l = pane.listing?.cluster === pane.cluster ? pane.listing : null
  useEffect(() => setLocation(pane.path), [pane.path])

  const mkdir = (name: string) => {
    setNaming(false)
    call('globus.mkdir', { cluster: pane.cluster, path: join(pane.path, name) })
      .then(pane.reload).catch((e: Error) => toast(`Failed: ${e.message}`))
  }
  const tap = (it: Item) => {
    if (pane.selected?.name !== it.name) pane.select(it)
    else if (it.is_dir) pane.go(join(pane.path, it.name))
    else pane.select(null)
  }

  let body: ReactNode
  if (!cfg) body = null
  else if (pane.error) body = <PaneEmpty icon={CircleAlert} title="Could not open folder" text={pane.error}
    button="Try again" onClick={pane.reload} />
  else if (!l) body = <div className="grid h-40 place-items-center"><Spinner size={20} /></div>
  else if (l.state === 'none') body = <PaneEmpty icon={FolderSearch} title={`No collection for ${cfg.name}`}
    text="Pick the Globus collection that holds its files." button="Choose collection" onClick={() => onChoose(cfg)} />
  else if (l.state === 'domain') body = <PaneEmpty icon={KeyRound}
    title={`${cfg.name} wants your ${l.want?.domains[0]} account`}
    text={`${l.collection} only lets in ${l.want?.domains.join(' or ')} accounts. Sign in with it once.`}
    button="Sign in" onClick={onConsent} />
  else if (l.state === 'consent') body = <PaneEmpty icon={KeyRound} title="Globus needs your permission"
    text={`Allow HPC Hub to use ${l.collection}.`} button="Allow" onClick={onConsent} />
  else if (l.state === 'offline') body = <PaneEmpty icon={WifiOff} title={`Globus Connect is not running on ${cfg.name}`}
    text={`Your ${l.collection} collection only works while it runs there. Start it on the login node? It shares ` +
      'your home, project and scratch folders, only with your own Globus account.'}
    button="Start it" onClick={() => onStart(cfg).then(pane.reload)} />
  else if (l.state === 'hidden') body = <PaneEmpty icon={FolderSearch} title="Globus can't open this folder yet"
    text={`Let it use all your Project and Scratch folders on ${cfg.name}, only with your own Globus account.`}
    button="Allow" onClick={() => onStart(cfg).then(pane.reload)} />
  else if (!l.items.length) body = <PaneEmpty icon={FolderOpen} title="Empty folder" />
  else body = (
    <div className="flex flex-col">
      <div className="sticky top-0 grid grid-cols-[1fr_64px] gap-2 border-b border-line bg-window px-3 py-2 text-xs
        font-semibold text-dim">
        <span className="pl-6">Name</span><span className="text-right">Size</span>
      </div>
      {l.items.map((it) => <ItemRow key={it.name} it={it} selected={pane.selected?.name === it.name}
        onSelect={() => tap(it)} onOpen={() => {}} />)}
    </div>
  )

  const browsing = l?.state === 'ok' && !!pane.path
  return (
    <section className="@container flex min-w-0 flex-col overflow-hidden rounded-lg border border-line">
      <div className="flex flex-col gap-2 border-b border-line p-2">
        <div className="flex items-center">
          <Choice label="Cluster" value={pane.cluster} onPick={pane.pick} className="mr-1 min-w-0 flex-1"
            options={clusters.map((c) => [c.id, shortName(c)] as const)} />
          <IconBtn small icon={ArrowUp} label="Up" onClick={() => browsing && pane.go(parent(pane.path))} />
          <IconBtn small icon={Home} label="Home" onClick={() => pane.go('')} />
          <Menu label="Go to a folder" trigger={<FolderOpen size={16} />} className={ICON}
            groups={[places.map((p) => ({ label: p.label, icon: p.path ? HardDrive : Home, onClick: () => pane.go(p.path) })),
              projects.map((p) => ({ label: p.label, icon: Bookmark, onClick: () => pane.go(p.path) }))]} />
          <IconBtn small icon={RefreshCw} label="Refresh" onClick={pane.reload} />
          <IconBtn small icon={FolderPlus} label="New folder" onClick={() => browsing && setNaming(true)} />
        </div>
        <input value={location} placeholder="/path" spellCheck={false} aria-label="Path"
          onChange={(e) => setLocation(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && pane.go(location.trim())}
          className="h-9 min-w-0 rounded-lg bg-soft px-3 font-mono text-sm outline-none focus:ring-1 focus:ring-accent" />
      </div>
      <div className="max-h-[260px] min-h-24 overflow-y-auto">{body}</div>
      <div className="flex h-8 shrink-0 items-center gap-2 border-t border-line px-3 text-xs text-dim">
        <span className="flex-1" />
        {pane.loading ? <><Spinner size={14} />Loading…</> : l?.state === 'ok' && `${l.items.length} items`}
      </div>
      {naming && <BackLayer onBack={() => setNaming(false)}>
        <NewFolder onClose={() => setNaming(false)} onCreate={mkdir} /></BackLayer>}
    </section>
  )
}
