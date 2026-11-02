// What a long press on a session offers: rename, change its color, stop it. The same calls as the desktop's ⋯ menu.
import { Palette, Pencil, Square, X } from 'lucide-react'
import { useRef, useState } from 'react'

import { close, getTab, tabKey, update } from '@shared/components/terminals/tabs'
import { call } from '@shared/rpc'
import { COLORS } from '@shared/types/terminals'
import { ActionSheet, Button, ConfirmSheet, Field, Sheet, useToast } from '../../ui'

/** The session the actions are for: one listed, or an open terminal's. */
export type Target = { cluster: string; name: string; kind: 'tmux' | 'screen'; node: string; title: string }

/** detach: from an open terminal, "Close" leaves the session running and goes back to the list. */
export function SessionActions({ target, onClose, onChanged, detach }:
  { target: Target; onClose: () => void; onChanged: () => void; detach?: () => void }) {
  const toast = useToast()
  const [step, setStep] = useState<'menu' | 'rename' | 'color' | 'stop'>('menu')
  const chosen = useRef(false)  // the action sheet closes itself before it runs the pick
  const pick = (next: typeof step) => { chosen.current = true; setStep(next) }
  const key = tabKey(target.cluster, target.name)
  const run = (method: string, extra: Record<string, unknown>, after: () => void = () => {}) => {
    call(method, { cluster: target.cluster, session: target.name, node: target.node, ...extra })
      .then(after)
      .catch((e: Error) => toast(`That didn't work: ${e.message}`))
      .finally(onChanged)
  }

  if (step === 'rename') return <RenameSheet title={target.title} onClose={onClose}
    onRename={(label) => run('terminals.rename', { label, kind: target.kind }, () => update(key, { title: label }))} />
  if (step === 'color') return <ColorSheet onClose={onClose}
    onPick={(color) => run('terminals.set_color', { color }, () => update(key, { color }))} />
  if (step === 'stop') return (
    <ConfirmSheet title={`Stop ${target.title}?`} danger keep="Keep it running" confirm="Stop session" onClose={onClose}
      text="Everything running in it ends, like an agent or a build."
      onConfirm={() => { if (getTab(key)) close(key); run('terminals.stop', { kind: target.kind }) }} />
  )
  return (
    <ActionSheet title={target.title} onClose={() => queueMicrotask(() => { if (!chosen.current) onClose() })}
      actions={[
      ...(detach ? [{ label: 'Close (it keeps running)', icon: X, onPick: () => { onClose(); detach() } }] : []),
      { label: 'Rename', icon: Pencil, onPick: () => pick('rename') },
      ...(target.kind === 'tmux' ? [{ label: 'Color', icon: Palette, onPick: () => pick('color') }] : []),
      { label: 'Stop session', icon: Square, danger: true, onPick: () => pick('stop') },
    ]} />
  )
}

function RenameSheet({ title, onClose, onRename }:
  { title: string; onClose: () => void; onRename: (label: string) => void }) {
  const [label, setLabel] = useState(title)
  const ok = label.trim() !== ''
  const done = () => { if (ok) { onClose(); onRename(label.trim()) } }
  return (
    <Sheet title="Rename session" onClose={onClose} actions={<>
      <Button className="flex-1" onClick={onClose}>Cancel</Button>
      <Button kind="primary" className="flex-1" disabled={!ok} onClick={done}>Rename</Button>
    </>}>
      <Field label="Name" autoFocus value={label} onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && done()} />
    </Sheet>
  )
}

function ColorSheet({ onClose, onPick }: { onClose: () => void; onPick: (color: string) => void }) {
  return (
    <Sheet title="Color" onClose={onClose}>
      <div className="grid grid-cols-4 gap-3">
        {COLORS.map((c) => (
          <button key={c} aria-label={`Color ${c}`} onClick={() => { onClose(); onPick(c) }}
            className="grid h-16 place-items-center rounded-2xl bg-card shadow-[var(--shadow-card)] active:bg-hover">
            <span className="size-8 rounded-full" style={{ background: c }} />
          </button>
        ))}
      </div>
    </Sheet>
  )
}
