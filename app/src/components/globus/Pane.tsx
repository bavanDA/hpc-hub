import { ArrowUp, Bookmark, ChevronDown, CircleAlert, FolderOpen, FolderPlus, FolderSearch, HardDrive, Home, KeyRound, RefreshCw, WifiOff } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import { call } from '../../rpc'
import type { GlobusCluster } from '../../types/globus'
import { shortName } from '../clusters/loginCopy'
import { join, parent } from '../files/format'
import { Menu } from '../projects/Menu'
import { IconButton } from '../ui/IconButton'
import { Spinner } from '../ui/Spinner'
import { useToast } from '../useToast'
import { Field } from './Field'
import { ItemRow } from './ItemRow'
import { NewFolder } from './NewFolder'
import { PaneEmpty } from './PaneEmpty'
import { usePlaces } from './places'
import type { Pane as PaneState } from './usePane'

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

  let body: ReactNode
  if (!cfg) body = null
  else if (pane.error) body = <PaneEmpty icon={CircleAlert} title="Could not open folder" text={pane.error}
    button="Try again" onClick={pane.reload} />
  else if (!l) body = <div className="grid h-full place-items-center"><Spinner size={20} /></div>
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
      <div className="sticky top-0 grid grid-cols-[1fr_64px_96px] gap-2 border-b border-line bg-window px-3 py-2
        text-xs font-semibold text-dim @max-[400px]:grid-cols-[1fr_64px]">
        <span className="pl-6">Name</span><span className="text-right">Size</span>
        <span className="@max-[400px]:hidden">Modified</span>
      </div>
      {l.items.map((it) => (
        <ItemRow key={it.name} it={it} selected={pane.selected?.name === it.name}
          onSelect={() => pane.select(pane.selected?.name === it.name ? null : it)}
          onOpen={() => it.is_dir && pane.go(join(pane.path, it.name))} />
      ))}
    </div>
  )

  const browsing = l?.state === 'ok' && !!pane.path
  return (
    <section className="@container flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-line">
      <div className="flex flex-col gap-2 border-b border-line p-2">
        <div className="flex items-center gap-1">
          <div className="relative min-w-0 flex-1">
            <select value={pane.cluster} onChange={(e) => pane.pick(e.target.value)} aria-label="Cluster"
              className="h-9 w-full appearance-none truncate rounded-lg border border-line-strong bg-window pr-8 pl-3
                font-medium outline-none hover:bg-hover focus-visible:border-accent">
              {clusters.map((c) => <option key={c.id} value={c.id}>{shortName(c)}</option>)}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-dim" />
          </div>
          <IconButton icon={ArrowUp} label="Up" size={16} onClick={() => browsing && pane.go(parent(pane.path))} />
          <IconButton icon={Home} label="Home" size={16} onClick={() => pane.go('')} />
          <Menu label="Go to a folder" trigger={<FolderOpen size={16} />}
            className="grid size-9 shrink-0 place-items-center rounded-md text-dim hover:bg-hover hover:text-text
              active:bg-pressed"
            groups={[places.map((p) => ({ label: p.label, icon: p.path ? HardDrive : Home, onClick: () => pane.go(p.path) })),
              projects.map((p) => ({ label: p.label, icon: Bookmark, onClick: () => pane.go(p.path) }))]} />
          <IconButton icon={RefreshCw} label="Refresh" size={16} onClick={pane.reload} />
          <IconButton icon={FolderPlus} label="New folder" size={16} onClick={() => browsing && setNaming(true)} />
        </div>
        <Field value={location} placeholder="/path" className="font-mono text-sm"
          onChange={(e) => setLocation(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && pane.go(location.trim())} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{body}</div>
      <div className="flex h-8 shrink-0 items-center gap-2 border-t border-line px-3 text-xs text-dim">
        <span className="flex-1" />
        {pane.loading ? <><Spinner size={14} />Loading…</> : l?.state === 'ok' && `${l.items.length} items`}
      </div>
      {naming && <NewFolder onClose={() => setNaming(false)} onCreate={mkdir} />}
    </section>
  )
}
