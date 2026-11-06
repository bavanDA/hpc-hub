import type { ReactNode } from 'react'

import { Button } from '../../ui/Button'
import type { Draft } from '../drafts'
import type { OpenFile } from '../store'
import { time } from './time'

export type Banner =
  | { kind: 'changed' }
  | { kind: 'agent'; agent: string; before: string }
  | { kind: 'deleted' }
  | { kind: 'draft'; draft: Draft; stale: boolean }

/** What happened to the open file (changed on the cluster, by an agent, gone, a kept draft) and what to do. */
export function BannerRow({ file, banner, clusterName, onDismiss, onReload, onCompare, onUndo, onSaveAgain, onRestore,
  onCompareDraft, onDiscardDraft }: {
  file: OpenFile; banner: Banner; clusterName: string; onDismiss: () => void; onReload: () => void
  onCompare: () => void; onUndo: (before: string) => void; onSaveAgain: () => void
  onRestore: (d: Draft) => void; onCompareDraft: (d: Draft) => void; onDiscardDraft: (d: Draft) => void
}) {
  let text: string
  let actions: ReactNode
  if (banner.kind === 'changed') {
    text = `${file.name} changed on ${clusterName} while you were editing it.`
    actions = <><Button size="sm" onClick={onCompare}>Compare</Button>
      <Button size="sm" onClick={onReload}>Use {clusterName}'s</Button>
      <Button size="sm" onClick={onSaveAgain}>Save mine</Button></>
  } else if (banner.kind === 'agent') {
    text = `${banner.agent} changed ${file.name}.`
    actions = <><Button size="sm" kind="ghost" onClick={() => onUndo(banner.before)}>Undo</Button>
      <Button size="sm" onClick={onDismiss}>Keep</Button></>
  } else if (banner.kind === 'deleted') {
    text = `${file.name} is gone from ${clusterName}.`
    actions = <><Button size="sm" kind="ghost" onClick={onDismiss}>Hide</Button>
      <Button size="sm" onClick={onSaveAgain}>Save it again</Button></>
  } else {
    const d = banner.draft
    text = banner.stale ? `You have edits from ${time(d.at)}, made on an older version of ${file.name}.`
      : `You have unsaved edits from ${time(d.at)}.`
    actions = banner.stale
      ? <><Button size="sm" kind="ghost" onClick={() => onDiscardDraft(d)}>Discard</Button>
          <Button size="sm" onClick={() => onCompareDraft(d)}>Compare</Button></>
      : <><Button size="sm" kind="ghost" onClick={() => onDiscardDraft(d)}>Discard</Button>
          <Button size="sm" kind="primary" onClick={() => onRestore(d)}>Restore</Button></>
  }
  return (
    <div role="status" className="flex shrink-0 items-center gap-2 border-b border-line bg-soft px-4 py-1.5">
      <p className="min-w-0 flex-1 text-sm">{text}</p>
      {actions}
    </div>
  )
}
