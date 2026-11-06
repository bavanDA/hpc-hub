import { MoreVertical } from 'lucide-react'
import { useRef, useState } from 'react'

import { call } from '../../rpc'
import { AlertDialog, Button, Dialog, IconButton } from '../ui'
import { useToast } from '../useToast'
import { MenuItem, Popover } from './Popover'
import { tabKey } from './tabKey'
import { close, update } from './tabs'
import { getTab } from './tabStore'

/** What the menu acts on: a listed session, or an open tab's. */
export type Target = { cluster: string; name: string; kind: 'tmux' | 'screen'; node: string; title: string }

const inputClass = 'h-10 w-full rounded-lg border border-line-strong bg-window px-3 outline-none '
  + 'focus:border-accent focus:ring-1 focus:ring-accent'

export function SessionMenu({ target, onChanged }: { target: Target; onChanged: () => void }) {
  const toast = useToast()
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const button = useRef<HTMLSpanElement>(null)
  const [dialog, setDialog] = useState<'rename' | 'stop' | null>(null)
  const params = { cluster: target.cluster, session: target.name, node: target.node }
  const key = tabKey(target.cluster, target.name)

  const run = (method: string, extra: Record<string, unknown>, after: () => void = () => {}) => {
    call(method, { ...params, ...extra })
      .then(after)
      .catch((e: Error) => toast(`Failed: ${e.message}`))
      .finally(onChanged)
  }

  return (
    // Clicks in the menu and its dialogs are not clicks on the row it sits in
    <span className="contents" onClick={(e) => e.stopPropagation()}>
      <span ref={button}>
        <IconButton icon={MoreVertical} label="Session" size={16} onClick={() => {
          const r = button.current!.getBoundingClientRect()
          setAt({ x: r.left, y: r.bottom + 4 })
        }} />
      </span>
      {at && (
        <Popover x={at.x} y={at.y} onClose={() => setAt(null)}>
          <MenuItem onClick={() => { setAt(null); setDialog('rename') }}>Rename…</MenuItem>
          <MenuItem danger onClick={() => { setAt(null); setDialog('stop') }}>Stop session…</MenuItem>
        </Popover>
      )}
      {dialog === 'rename' && (
        <RenameDialog target={target} onClose={() => setDialog(null)}
          onRename={(label) => run('terminals.rename', { label, kind: target.kind }, () => update(key, { title: label }))} />
      )}
      {dialog === 'stop' && (
        <AlertDialog title={`Stop ${target.title}?`} keep="Keep it running" act="Stop session"
          onClose={() => setDialog(null)} onAct={() => {
            setDialog(null)
            if (getTab(key)) close(key)
            run('terminals.stop', { kind: target.kind })
          }}>
          <p>Everything running in it stops.</p>
        </AlertDialog>
      )}
    </span>
  )
}

function RenameDialog({ target, onClose, onRename }:
  { target: Target; onClose: () => void; onRename: (label: string) => void }) {
  const [label, setLabel] = useState(target.title)
  const ok = label.trim() !== ''
  const done = () => { if (ok) { onClose(); onRename(label.trim()) } }
  return (
    <Dialog title="Rename session" onClose={onClose} width={400} actions={<>
      <Button onClick={onClose}>Cancel</Button>
      <Button kind="primary" disabled={!ok} onClick={done}>Rename</Button>
    </>}>
      <p className="mb-3 text-sm text-dim">{target.name}</p>
      <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass}
        onKeyDown={(e) => e.key === 'Enter' && done()} />
    </Dialog>
  )
}
