// One side of the Globus page: a cluster's collection, browsed through Globus (no SSH or VPN needed).
import {
  ArrowUp, CircleAlert, File, Folder, FolderOpen, FolderPlus, FolderSearch, Home, KeyRound, RefreshCw, WifiOff,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import { call } from '../../rpc'
import type { GlobusCluster, Item } from '../../types/globus'
import { useToast } from '../toast'
import { Button, Card, Dialog, IconButton, Spinner } from '../ui'
import { Field, formatSize, joinPath, parentPath, shortDate } from './parts'
import type { Pane as PaneState } from './usePane'

function Empty({ icon: Icon, title, text, button, onClick }:
  { icon: LucideIcon; title: string; text?: string; button?: string; onClick?: () => void }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <Icon size={40} strokeWidth={1.25} className="text-dim" />
      <h3 className="text-lg font-semibold leading-snug">{title}</h3>
      {text && <p className="max-w-xs text-sm text-dim">{text}</p>}
      {button && <Button kind="primary" onClick={onClick}>{button}</Button>}
    </div>
  )
}

function NewFolder({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState('')
  const ok = !!name.trim() && !name.includes('/')
  const create = () => ok && onCreate(name.trim())
  return (
    <Dialog title="New folder" onClose={onClose} width={380}
      actions={<><Button onClick={onClose}>Cancel</Button>
        <Button kind="suggested" disabled={!ok} onClick={create}>Create</Button></>}>
      <Field autoFocus className="w-full" placeholder="Folder name" value={name}
        onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
    </Dialog>
  )
}

function ItemRow({ it, selected, onSelect, onOpen }:
  { it: Item; selected: boolean; onSelect: () => void; onOpen: () => void }) {
  const Icon = it.is_dir ? Folder : File
  return (
    <div onClick={onSelect} onDoubleClick={onOpen}
      className={`grid h-9 grid-cols-[1fr_64px_96px] items-center gap-2 rounded-md px-2 ${
        selected ? 'bg-accent/20' : 'hover:bg-hover'}`}>
      <span className="flex min-w-0 items-center gap-2">
        <Icon size={16} className={`shrink-0 ${'text-dim'}`} />
        <span className="truncate">{it.name}</span>
      </span>
      <span className="text-right text-sm tabular-nums text-dim">{it.is_dir ? '' : formatSize(it.size)}</span>
      <span className="truncate text-sm tabular-nums text-dim">{shortDate(it.modified)}</span>
    </div>
  )
}

export function Pane({ pane, clusters, onChoose, onConsent, onStart }: {
  pane: PaneState; clusters: GlobusCluster[]; onChoose: (c: GlobusCluster) => void; onConsent: () => void
  onStart: (c: GlobusCluster) => Promise<void>
}) {
  const toast = useToast()
  const [location, setLocation] = useState('')
  const [naming, setNaming] = useState(false)
  const cfg = clusters.find((c) => c.id === pane.cluster)
  const l = pane.listing?.cluster === pane.cluster ? pane.listing : null
  useEffect(() => setLocation(pane.path), [pane.path])

  const mkdir = (name: string) => {
    setNaming(false)
    call('globus.mkdir', { cluster: pane.cluster, path: joinPath(pane.path, name) })
      .then(pane.reload).catch((e: Error) => toast(`Failed: ${e.message}`))
  }

  let body: ReactNode
  if (!cfg) body = null
  else if (pane.error) body = <Empty icon={CircleAlert} title="Could not open folder" text={pane.error}
    button="Try again" onClick={pane.reload} />
  else if (!l) body = <div className="grid h-full place-items-center"><Spinner size={20} /></div>
  else if (l.state === 'none') body = <Empty icon={FolderSearch} title={`No collection for ${cfg.name}`}
    text="Pick the Globus collection that holds its files." button="Choose collection" onClick={() => onChoose(cfg)} />
  else if (l.state === 'domain') body = <Empty icon={KeyRound}
    title={`${cfg.name} wants your ${l.want?.domains[0]} account`}
    text={`${l.collection} only lets in ${l.want?.domains.join(' or ')} accounts. Sign in with it once.`}
    button="Sign in" onClick={onConsent} />
  else if (l.state === 'consent') body = <Empty icon={KeyRound} title="Globus needs your permission"
    text={`Allow HPC Hub to use ${l.collection}.`} button="Allow" onClick={onConsent} />
  else if (l.state === 'offline') body = <Empty icon={WifiOff} title={`Globus Connect is not running on ${cfg.name}`}
    text={`Your ${l.collection} collection only works while it runs there. Start it on the login node? It shares ` +
      'your home, project and scratch folders, only with your own Globus account.'}
    button="Start it" onClick={() => onStart(cfg).then(pane.reload)} />
  else if (!l.items.length) body = <Empty icon={FolderOpen} title="Empty folder" />
  else body = (
    <div className="flex flex-col px-2 pb-2">
      <div className="sticky top-0 grid grid-cols-[1fr_64px_96px] gap-2 bg-card px-2 py-1.5 text-xs font-semibold
        text-dim">
        <span className="pl-6">Name</span><span className="text-right">Size</span><span>Modified</span>
      </div>
      {l.items.map((it) => (
        <ItemRow key={it.name} it={it} selected={pane.selected?.name === it.name}
          onSelect={() => pane.select(pane.selected?.name === it.name ? null : it)}
          onOpen={() => it.is_dir && pane.go(joinPath(pane.path, it.name))} />
      ))}
    </div>
  )

  const browsing = l?.state === 'ok' && !!pane.path
  return (
    <Card className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-line p-2">
        <div className="flex items-center gap-1">
          <select value={pane.cluster} onChange={(e) => pane.pick(e.target.value)} aria-label="Cluster"
            className="h-9 min-w-0 flex-1 truncate rounded-md bg-pill px-2 font-semibold outline-none hover:bg-selected">
            {clusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <IconButton icon={ArrowUp} label="Up" size={16} onClick={() => browsing && pane.go(parentPath(pane.path))} />
          <IconButton icon={Home} label="Home" size={16} onClick={() => pane.go('')} />
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
    </Card>
  )
}
