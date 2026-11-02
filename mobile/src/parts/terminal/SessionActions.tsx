// What a long press on a session offers: rename or stop it, and open an agent's remote control or copy ChatGPT's
// pairing code. The same calls as the desktop's ⋯ menu.
import { Copy, ExternalLink, Pencil, Square, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { openLink } from '@shared/components/app/openLink'
import { close, getTab, tabKey, update } from '@shared/components/terminals/tabs'
import { copyText } from '@shared/components/terminals/xterm'
import { call } from '@shared/rpc'
import type { Listing } from '@shared/types/terminals'
import { ActionSheet, ConfirmSheet, Field, MainButton, Sheet, useToast } from '../../ui'

/** The session the actions are for: one listed, or an open terminal's. remote: the agent's remote-control link, or
 *  code:<pairing code> for ChatGPT. */
export type Target = { cluster: string; name: string; kind: 'tmux' | 'screen'; node: string; title: string
  remote?: string }

/** detach: from an open terminal, "Close" leaves the session running and goes back to the list. */
export function SessionActions({ target, onClose, onChanged, detach }:
  { target: Target; onClose: () => void; onChanged: () => void; detach?: () => void }) {
  const toast = useToast()
  const [step, setStep] = useState<'menu' | 'rename' | 'stop'>('menu')
  const chosen = useRef(false)  // the action sheet closes itself before it runs the pick
  const pick = (next: typeof step) => { chosen.current = true; setStep(next) }
  const key = tabKey(target.cluster, target.name)
  // An open terminal doesn't carry the agent's link, so ask the list for it.
  const [found, setFound] = useState('')
  useEffect(() => {
    if (target.remote !== undefined) return
    call<Listing>('terminals.list', { cluster: target.cluster })
      .then((l) => setFound(l.sessions.find((s) => s.name === target.name)?.remote ?? ''))
      .catch(() => {})
  }, [target.cluster, target.name, target.remote])
  const run = (method: string, extra: Record<string, unknown>, after: () => void = () => {}) => {
    call(method, { cluster: target.cluster, session: target.name, node: target.node, ...extra })
      .then(after)
      .catch((e: Error) => toast(`That didn't work: ${e.message}`))
      .finally(onChanged)
  }

  if (step === 'rename') return <RenameSheet title={target.title} onClose={onClose}
    onRename={(label) => run('terminals.rename', { label, kind: target.kind }, () => update(key, { title: label }))} />
  if (step === 'stop') return (
    <ConfirmSheet title={`Stop ${target.title}?`} danger keep="Keep it running" confirm="Stop session" onClose={onClose}
      text="Everything running in it ends, like an agent or a build."
      onConfirm={() => { if (getTab(key)) close(key); run('terminals.stop', { kind: target.kind }) }} />
  )
  const remote = target.remote ?? found
  const pair = remote.startsWith('code:') ? remote.slice(5) : ''
  const others = pair
    ? [{ label: 'Copy ChatGPT pairing code', icon: Copy, onPick: () => { onClose(); copyText(pair).then((ok) =>
        toast(ok ? `Pairing code ${pair} copied. In the ChatGPT app: Codex, connect a machine.` : 'Could not copy')) } }]
    : remote.startsWith('http')
      ? [{ label: 'Open in the Claude app', icon: ExternalLink, onPick: () => { onClose()
          openLink(remote).catch((err) => toast(`Could not open it: ${err}`)) } }]
      : []
  return (
    <ActionSheet title={target.title} onClose={() => queueMicrotask(() => { if (!chosen.current) onClose() })}
      actions={[
      ...(detach ? [{ label: 'Close (it keeps running)', icon: X, onPick: () => { onClose(); detach() } }] : []),
      ...others,
      { label: 'Rename', icon: Pencil, onPick: () => pick('rename') },
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
    <Sheet title="Rename session" onClose={onClose}
      actions={<MainButton disabled={!ok} onClick={done}>Rename</MainButton>}>
      <Field label="Name" autoFocus value={label} onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && done()} />
    </Sheet>
  )
}

