import { useState } from 'react'

import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Switch } from '../ui/Switch'
import { inputClass, type Target } from './SessionMenu'

const CHATS: Record<string, string> = { claude: 'Claude' }  // agents whose chat can take the new name too
const CHAT_KEY = 'hpchub.renameChat'  // remembered: on unless you turned it off

function remembered(): boolean {
  try { return localStorage.getItem(CHAT_KEY) !== 'off' } catch { return true }
}

/** onRename(label, chat): chat asks the agent in it (Claude) to take the name too, so its resume list shows it. */
export function RenameDialog({ target, onClose, onRename }:
  { target: Target; onClose: () => void; onRename: (label: string, chat: boolean) => void }) {
  const [label, setLabel] = useState(target.title)
  const agent = target.kind === 'tmux' ? CHATS[/^hpchub-([a-z]+)-/.exec(target.name)?.[1] ?? ''] : undefined
  const [chat, setChat] = useState(remembered)
  const ok = label.trim() !== ''
  const done = () => {
    if (!ok) return
    onClose()
    onRename(label.trim(), !!agent && chat)
  }
  const pick = (on: boolean) => {
    setChat(on)
    try { localStorage.setItem(CHAT_KEY, on ? 'on' : 'off') } catch { /* only a convenience */ }
  }
  return (
    <Dialog title="Rename session" onClose={onClose} width={400} actions={<>
      <Button onClick={onClose}>Cancel</Button>
      <Button kind="primary" disabled={!ok} onClick={done}>Rename</Button>
    </>}>
      <p className="mb-3 text-sm text-dim">{target.name}</p>
      <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass}
        onKeyDown={(e) => e.key === 'Enter' && done()} />
      {agent && <div className="mt-4 flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block">Rename the {agent} chat too</span>
          <span className="block text-sm text-dim">Types /rename into {agent}, so its resume list shows this
            name.</span>
        </span>
        <Switch on={chat} onChange={pick} label={`Rename the ${agent} chat too`} />
      </div>}
    </Dialog>
  )
}
