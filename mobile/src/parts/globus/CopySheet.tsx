// A new Globus copy on a phone: one pane at a time. From: pick the cluster, open folders, tap what to copy.
// To: pick the cluster and open the folder it goes into, then "Copy here". Globus does the rest, app closed or not.
import {
  ArrowUp, Bookmark, Check, ChevronRight, CircleAlert, File, Folder, FolderOpen, FolderPlus, HardDrive, House, KeyRound,
  Play, Plug,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { size as formatSize, join as joinPath, parent as parentPath } from '@shared/components/files/format'
import { usePlaces } from '@shared/components/globus/places'
import { Spinner } from '@shared/components/ui/Spinner'
import { call } from '@shared/rpc'
import type { GlobusCluster, GlobusStatus, Item } from '@shared/types/globus'
import { ActionSheet, Button, EmptyState, MainButton, PickerSheet, PromptSheet, Segments, Sheet, useToast } from '../../ui'
import { shortCluster, wrapPath } from '../code/util'
import { usePane, type Pane } from './usePane'

type Side = 'from' | 'to'

function PaneView({ pane, side, clusters, onChooseCluster, onConsent, onChooseCollection, onStart }: {
  pane: Pane; side: Side; clusters: GlobusCluster[]; onChooseCluster: () => void; onConsent: () => void
  onChooseCollection: (c: GlobusCluster) => void; onStart: (c: GlobusCluster) => void
}) {
  const c = clusters.find((x) => x.id === pane.cluster)
  const l = pane.listing
  const [goTo, setGoTo] = useState(false)
  const { places, projects } = usePlaces(pane.cluster)
  let body
  if (!c) body = null
  else if (pane.error) body = <EmptyState icon={CircleAlert} title="Can't open this folder" text={pane.error} />
  else if (!l) body = <div className="grid h-40 place-items-center"><Spinner size={28} /></div>
  else if (l.state === 'none') {
    body = <EmptyState icon={Plug} title={`No Globus collection for ${shortCluster(c.name)}`}
      text="Pick the one that holds its files."
      action={<Button onClick={() => onChooseCollection(c)}>Choose a collection</Button>} />
  } else if (l.state === 'offline') {
    body = <EmptyState icon={Plug} title={`Globus Connect isn't running on ${shortCluster(c.name)}`}
      text="Start it to reach your files there." action={
        <Button icon={Play} onClick={() => onStart(c)}>Start it</Button>} />
  } else if (l.state === 'hidden') {
    body = <EmptyState icon={KeyRound} title="Globus can't open this folder yet"
      text={`Let it use all your Project and Scratch folders on ${shortCluster(c.name)}.`}
      action={<Button onClick={() => onStart(c)}>Allow</Button>} />
  } else if (l.state === 'consent' || l.state === 'domain') {
    body = <EmptyState icon={KeyRound} title={`Globus needs your OK for ${shortCluster(c.name)}`}
      text={l.want?.message || 'Once. Globus remembers it.'}
      action={<Button onClick={onConsent}>Allow</Button>} />
  } else {
    const items = [...l.items].sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name))
    body = (
      <>
        {!items.length && <p className="p-4 text-center text-dim">This folder is empty.</p>}
        {items.length > 0 && (
          <div className="border-t border-line">
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
      <div className="flex flex-col">
        <button onClick={onChooseCluster} className="flex min-h-14 items-center gap-3 border-y border-line px-4
          text-left active:bg-pressed">
          <span className="flex-1">{side === 'from' ? 'From' : 'To'}</span>
          <span className="font-medium">{c ? shortCluster(c.name) : 'Pick a cluster'}</span>
          {pane.loading ? <Spinner size={16} /> : <ChevronRight size={18} className="-mr-1 text-dim" />}
        </button>
        {c && l?.state === 'ok' && (
          <div className="flex items-center gap-1 px-1">
            <button aria-label="Up one folder" disabled={!pane.path || pane.path === '/'}
              onClick={() => pane.go(parentPath(pane.path))}
              className="grid size-12 shrink-0 place-items-center rounded-full text-dim active:bg-pressed disabled:opacity-40">
              <ArrowUp size={20} /></button>
            <p className="min-w-0 flex-1 py-1 text-sm break-words text-dim">
              {pane.path ? wrapPath(pane.path) : 'Home folder'}</p>
            <button aria-label="Go to a folder" onClick={() => setGoTo(true)}
              className="grid size-12 shrink-0 place-items-center rounded-full text-dim active:bg-pressed">
              <FolderOpen size={20} /></button>
          </div>
        )}
        {goTo && <ActionSheet title="Go to" onClose={() => setGoTo(false)} actions={[
          ...places.map((p) => ({ label: p.label, icon: p.path ? HardDrive : House, onPick: () => pane.go(p.path) })),
          ...projects.map((p) => ({ label: p.label, icon: Bookmark, onPick: () => pane.go(p.path) }))]} />}
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
    <div className={`flex items-center border-b border-line ${picked ? 'bg-soft' : ''}`}>
      <button onClick={tap} disabled={!tap} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 pl-4
        text-left active:bg-pressed disabled:opacity-50">
        <Icon size={22} className="shrink-0 text-dim" />
        <span className="min-w-0 flex-1">
          <span className="block break-all">{item.name}</span>
          {!item.is_dir && <span className="block text-sm text-dim">{formatSize(item.size)}</span>}
        </span>
      </button>
      {side === 'from' && (
        <button aria-label={picked ? `Unpick ${item.name}` : `Pick ${item.name}`} aria-pressed={picked} onClick={onPick}
          className="grid size-12 shrink-0 place-items-center">
          <span className={`grid size-6 place-items-center rounded-full border-2 ${
            picked ? 'border-accent bg-accent text-on-accent' : 'border-line-strong'}`}>{picked && <Check size={14} />}</span>
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
    toast(`Starting Globus Connect on ${shortCluster(c.name)}`)
    call('globus.start_personal', { cluster: c.id })
      .then(() => { toast(`Globus Connect is running on ${shortCluster(c.name)}`); pane.reload() })
      .catch((e: Error) => toast(`Couldn't start it: ${e.message}`))
  }
  const send = () => {
    const it = from.selected
    if (!it || !to.path) return
    call('globus.transfer', { src_cluster: from.cluster, src_path: joinPath(from.path, it.name),
      dst_cluster: to.cluster, dst_path: joinPath(to.path, it.name), recursive: it.is_dir })
      .then(() => { toast(`Sent ${it.name} to Globus. It keeps going with the app closed.`); onSent() })
      .catch((e: Error) => toast(`Couldn't send it: ${e.message}`))
  }
  const toName = shortCluster(status.clusters.find((c) => c.id === to.cluster)?.name ?? '')

  return (
    <Sheet flush title="New Globus copy" onClose={onClose} actions={side === 'from'
      ? <MainButton disabled={!from.selected} onClick={() => setSide('to')}>
        {from.selected ? `Next: where ${from.selected.name} goes` : 'Pick what to copy'}</MainButton>
      : <>
        <Button icon={FolderPlus} aria-label="New folder" className="h-[52px]" disabled={!to.path}
          onClick={() => setMkdir(true)} />
        <MainButton className="min-w-0 flex-1 break-all" disabled={!from.selected || !to.path} onClick={send}>
          {from.selected ? `Copy ${from.selected.name} here` : 'Pick what to copy first'}</MainButton></>}>
      <div className="flex h-full flex-col gap-3">
        <div className="px-4"><Segments value={side} options={[['from', from.selected ? `From: ${from.selected.name}` : 'From'],
          ['to', toName ? `To: ${toName}` : 'To']]} onChange={setSide} /></div>
        <PaneView pane={pane} side={side} clusters={status.clusters} onChooseCluster={() => setPicking(side)}
          onConsent={onConsent} onChooseCollection={onChooseCollection} onStart={start} />
      </div>
      {picking && <PickerSheet title={picking === 'from' ? 'Copy from' : 'Copy to'} onClose={() => setPicking(null)}
        value={(picking === 'from' ? from : to).cluster}
        options={status.clusters.map((c) => ({ value: c.id, label: shortCluster(c.name), hint: c.collection_name || 'No collection yet' }))}
        onPick={(id) => (picking === 'from' ? from : to).pick(id)} />}
      {mkdir && <PromptSheet title="New folder" label="Name" confirm="Make it" onClose={() => setMkdir(false)}
        onSubmit={(n) => call('globus.mkdir', { cluster: to.cluster, path: joinPath(to.path, n) })
          .then(() => to.go(joinPath(to.path, n))).catch((e: Error) => toast(`Couldn't make it: ${e.message}`))} />}
    </Sheet>
  )
}
