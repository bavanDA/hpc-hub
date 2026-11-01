// A new Globus copy on a phone: one pane at a time. From: pick the cluster, open folders, tap what to copy.
// To: pick the cluster and open the folder it goes into, then "Copy here". Globus does the rest, app closed or not.
import { ArrowUp, Check, CircleAlert, File, Folder, FolderPlus, KeyRound, Play, Plug } from 'lucide-react'
import { useEffect, useState } from 'react'

import { formatSize, joinPath, parentPath } from '@shared/components/globus/parts'
import { EmptyState, Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { GlobusCluster, GlobusStatus, Item } from '@shared/types/globus'
import { Button, PickerSheet, PromptSheet, Segments, Sheet, useToast } from '../../ui'
import { usePane, type Pane } from './usePane'

type Side = 'from' | 'to'

function PaneView({ pane, side, clusters, onChooseCluster, onConsent, onChooseCollection, onStart }: {
  pane: Pane; side: Side; clusters: GlobusCluster[]; onChooseCluster: () => void; onConsent: () => void
  onChooseCollection: (c: GlobusCluster) => void; onStart: (c: GlobusCluster) => void
}) {
  const c = clusters.find((x) => x.id === pane.cluster)
  const l = pane.listing
  let body
  if (!c) body = null
  else if (pane.error) body = <EmptyState icon={CircleAlert} title="Can't open this folder" text={pane.error} />
  else if (!l) body = <div className="grid h-40 place-items-center"><Spinner size={28} /></div>
  else if (l.state === 'none') {
    body = <EmptyState icon={Plug} title={`No Globus collection for ${c.name}`} text="Pick the one that holds its files."
      action={<Button kind="primary" onClick={() => onChooseCollection(c)}>Choose a collection</Button>} />
  } else if (l.state === 'offline') {
    body = <EmptyState icon={Plug} title={`Globus Connect isn't running on ${c.name}`}
      text="Your own collection needs it running on the cluster." action={
        <Button kind="primary" icon={Play} onClick={() => onStart(c)}>Start it</Button>} />
  } else if (l.state === 'consent' || l.state === 'domain') {
    body = <EmptyState icon={KeyRound} title={`Globus needs your OK for ${c.name}`}
      text={l.want?.message || 'One time. Globus remembers it.'}
      action={<Button kind="primary" onClick={onConsent}>Allow</Button>} />
  } else {
    const items = [...l.items].sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name))
    body = (
      <>
        {!items.length && <p className="p-4 text-center text-dim">This folder is empty.</p>}
        {items.length > 0 && (
          <div className="overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-card)]">
            {items.map((it) => <ItemRow key={it.name} item={it} side={side} picked={pane.selected?.name === it.name}
              onOpen={() => pane.go(joinPath(pane.path, it.name))}
              onPick={() => pane.select(pane.selected?.name === it.name ? null : it)} />)}
          </div>
        )}
      </>
    )
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 pb-2">
        <button onClick={onChooseCluster} className="flex h-12 items-center gap-3 rounded-xl bg-pill px-4 text-left">
          <span className="text-sm text-dim">{side === 'from' ? 'From' : 'To'}</span>
          <span className="min-w-0 flex-1 truncate font-semibold">{c?.name ?? 'Pick a cluster'}</span>
          {pane.loading && <Spinner size={16} />}
        </button>
        {pane.path && (
          <div className="flex items-center gap-2">
            <button aria-label="Up" disabled={pane.path === '/'} onClick={() => pane.go(parentPath(pane.path))}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-pill disabled:opacity-40">
              <ArrowUp size={20} /></button>
            <p className="min-w-0 flex-1 truncate text-sm text-dim [direction:rtl]"><bdi dir="ltr">{pane.path}</bdi></p>
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">{body}</div>
    </div>
  )
}

function ItemRow({ item, side, picked, onOpen, onPick }:
  { item: Item; side: Side; picked: boolean; onOpen: () => void; onPick: () => void }) {
  const Icon = item.is_dir ? Folder : File
  // From: files are picked with a tap; folders open, and the circle picks the whole folder. To: only folders.
  const tap = item.is_dir ? onOpen : side === 'from' ? onPick : undefined
  return (
    <div className={`flex items-center border-b border-line last:border-0 ${picked ? 'bg-accent/10' : ''}`}>
      <button onClick={tap} disabled={!tap} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 pl-4
        text-left active:bg-hover disabled:opacity-50">
        <Icon size={22} className={`shrink-0 ${item.is_dir ? 'text-accent-text' : 'text-dim'}`} />
        <span className="min-w-0 flex-1">
          <span className="block truncate">{item.name}</span>
          {!item.is_dir && <span className="block text-sm text-dim">{formatSize(item.size)}</span>}
        </span>
      </button>
      {side === 'from' && (
        <button aria-label={picked ? `Unpick ${item.name}` : `Pick ${item.name}`} aria-pressed={picked} onClick={onPick}
          className="grid size-12 shrink-0 place-items-center">
          <span className={`grid size-6 place-items-center rounded-full border-2 ${
            picked ? 'border-accent bg-accent text-white' : 'border-line-strong'}`}>{picked && <Check size={14} />}</span>
        </button>
      )}
    </div>
  )
}

/** stamp: a new number reloads both sides (after an Allow, or a collection picked). */
export function CopySheet({ status, stamp, onClose, onConsent, onChooseCollection, onSent }: {
  status: GlobusStatus; stamp: number; onClose: () => void; onConsent: () => void
  onChooseCollection: (c: GlobusCluster) => void; onSent: () => void
}) {
  const toast = useToast()
  const from = usePane(() => {})
  const to = usePane(() => {})
  const [side, setSide] = useState<Side>('from')
  const [picking, setPicking] = useState<Side | null>(null)
  const [mkdir, setMkdir] = useState(false)
  const pane = side === 'from' ? from : to

  useEffect(() => {  // clusters with a collection first, a different one on each side
    const order = [...status.clusters.filter((c) => c.collection_id), ...status.clusters]
    const first = order[0]?.id ?? ''
    from.pick(first)
    to.pick(order.find((c) => c.id !== first)?.id ?? first)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!stamp) return
    from.reload()
    to.reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp])

  const start = (c: GlobusCluster) => {
    toast(`Starting Globus Connect on ${c.name}`)
    call('globus.start_personal', { cluster: c.id })
      .then(() => { toast(`Globus Connect is running on ${c.name}`); pane.reload() })
      .catch((e: Error) => toast(`Could not start it: ${e.message}`))
  }
  const send = () => {
    const it = from.selected
    if (!it || !to.path) return
    call('globus.transfer', { src_cluster: from.cluster, src_path: joinPath(from.path, it.name),
      dst_cluster: to.cluster, dst_path: joinPath(to.path, it.name), recursive: it.is_dir })
      .then(() => { toast(`Sent ${it.name} to Globus. It keeps going with the app closed.`); onSent() })
      .catch((e: Error) => toast(`Could not send it: ${e.message}`))
  }
  const toName = status.clusters.find((c) => c.id === to.cluster)?.name ?? ''

  return (
    <Sheet title="New Globus copy" onClose={onClose} actions={side === 'from'
      ? <Button kind="primary" className="flex-1" disabled={!from.selected} onClick={() => setSide('to')}>
        {from.selected ? `Next: where ${from.selected.name} goes` : 'Pick what to copy'}</Button>
      : <>
        <Button icon={FolderPlus} aria-label="New folder" disabled={!to.path} onClick={() => setMkdir(true)} />
        <Button kind="primary" className="min-w-0 flex-1" disabled={!from.selected || !to.path} onClick={send}>
          <span className="truncate">{from.selected ? `Copy ${from.selected.name} here` : 'Pick what to copy first'}</span>
        </Button></>}>
      <div className="flex h-full flex-col gap-3">
        <Segments value={side} options={[['from', from.selected ? `From: ${from.selected.name}` : 'From'],
          ['to', toName ? `To: ${toName}` : 'To']]} onChange={setSide} />
        <PaneView pane={pane} side={side} clusters={status.clusters} onChooseCluster={() => setPicking(side)}
          onConsent={onConsent} onChooseCollection={onChooseCollection} onStart={start} />
      </div>
      {picking && <PickerSheet title={picking === 'from' ? 'Copy from' : 'Copy to'} onClose={() => setPicking(null)}
        value={(picking === 'from' ? from : to).cluster}
        options={status.clusters.map((c) => ({ value: c.id, label: c.name, hint: c.collection_name || 'No collection yet' }))}
        onPick={(id) => (picking === 'from' ? from : to).pick(id)} />}
      {mkdir && <PromptSheet title="New folder" label="Name" confirm="Make it" onClose={() => setMkdir(false)}
        onSubmit={(n) => call('globus.mkdir', { cluster: to.cluster, path: joinPath(to.path, n) })
          .then(() => to.go(joinPath(to.path, n))).catch((e: Error) => toast(`Could not make it: ${e.message}`))} />}
    </Sheet>
  )
}
