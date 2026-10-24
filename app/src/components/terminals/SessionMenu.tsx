// A session's ⋯ menu: rename, color, stop.
import { MoreVertical } from 'lucide-react'
import { useRef, useState } from 'react'

import { call } from '../../rpc'
import { COLORS } from '../../types/terminals'
import { useToast } from '../toast'
import { Button, Dialog, IconButton } from '../ui'
import { Dot, MenuItem, Popover } from './Popover'
import { close, getTab, tabKey, update } from './tabs'

/** What the menu acts on: a listed session, or an open tab's. */
export type Target = { cluster: string; name: string; kind: 'tmux' | 'screen'; node: string; title: string }

export const inputClass = 'h-10 w-full rounded-md bg-pill px-3 outline-none focus:ring-2 focus:ring-accent'

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
  const pick = (color: string) => {
    setAt(null)
    run('terminals.set_color', { color }, () => update(key, { color }))
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
          {target.kind === 'tmux' && (
            <div className="flex gap-1 px-2 py-1.5">
              {COLORS.map((c) => (
                <button key={c} title={c} onClick={() => pick(c)}
                  className="grid size-7 place-items-center rounded-full hover:bg-hover"><Dot color={c} size={14} /></button>
              ))}
            </div>
          )}
          <MenuItem danger onClick={() => { setAt(null); setDialog('stop') }}>Stop session…</MenuItem>
        </Popover>
      )}
      {dialog === 'rename' && (
        <RenameDialog target={target} onClose={() => setDialog(null)}
          onRename={(label) => run('terminals.rename', { label, kind: target.kind }, () => update(key, { title: label }))} />
      )}
      {dialog === 'stop' && (
        <Dialog title={`Stop ${target.title}?`} onClose={() => setDialog(null)} width={400} actions={<>
          <Button onClick={() => setDialog(null)}>Cancel</Button>
          <Button kind="destructive" onClick={() => {
            setDialog(null)
            if (getTab(key)) close(key)
            run('terminals.stop', { kind: target.kind })
          }}>Stop</Button>
        </>}>
          <p className="text-dim">Everything running in it ends (Claude, a build…).</p>
        </Dialog>
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
      <Button kind="suggested" disabled={!ok} onClick={done}>Rename</Button>
    </>}>
      <p className="mb-3 text-[13px] text-dim">{target.name}</p>
      <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass}
        onKeyDown={(e) => e.key === 'Enter' && done()} />
    </Dialog>
  )
}
