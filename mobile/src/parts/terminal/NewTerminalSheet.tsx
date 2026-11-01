// New terminal: a name, the cluster, the login node or your compute node (with what each is for), the folder it
// starts in and a color. It runs in tmux, so it keeps going when you leave it.
import { Check, FolderOpen } from 'lucide-react'
import { useState } from 'react'

import type { Live } from '@shared/components/terminals/data'
import { openNew } from '@shared/components/terminals/tabs'
import { COLORS } from '@shared/types/terminals'
import { Button, Field, Segments, Sheet, useToast } from '../../ui'
import { FolderSheet } from './FolderSheet'

export function NewTerminalSheet({ live, cluster: first = '', onClose, onOpened }:
  { live: Live[]; cluster?: string; onClose: () => void; onOpened: () => void }) {
  const toast = useToast()
  const [name, setName] = useState(() => `Terminal ${new Date().toTimeString().slice(0, 5)}`)
  const [picked, setPicked] = useState(first)
  const c = live.find((x) => x.id === picked) ?? live[0]
  const [where, setWhere] = useState<'login' | 'node' | ''>('')  // '': the node when there is one
  const onNode = Boolean(c?.node) && (where || (c?.node ? 'node' : 'login')) === 'node'
  const [folder, setFolder] = useState('~')
  const [color, setColor] = useState(COLORS[0])
  const [choosing, setChoosing] = useState(false)

  const open = () => {
    if (!c) return
    onClose()
    openNew(c.id, { name: name.trim() || 'Terminal', node: onNode, folder: folder.trim() || '~', color })
      .then(onOpened).catch((e: Error) => toast(`Could not open the terminal: ${e.message}`))
  }

  const hint = onNode ? 'Your own compute node, for real work.'
    : c?.node ? "The login node is shared. Use it to edit files and submit jobs, not for heavy work."
      : "You have no compute node right now, so it runs on the login node. Don't run heavy work there."
  return (
    <Sheet title="New terminal" onClose={onClose} actions={
      <Button kind="primary" className="flex-1" disabled={!c} onClick={open}>Open terminal</Button>}>
      <p className="mb-2 text-dim">It keeps running when you leave it or close the app.</p>
      <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      {live.length > 1 && (
        <div className="py-2">
          <span className="mb-1 block text-sm font-bold text-dim">Cluster</span>
          <Segments value={c?.id ?? ''} options={live.map((x) => [x.id, x.name] as const)}
            onChange={(id) => { setPicked(id); setWhere('') }} />
        </div>
      )}
      <div className="py-2">
        <span className="mb-1 block text-sm font-bold text-dim">Run on</span>
        {c?.node
          ? <Segments value={onNode ? 'node' : 'login'} onChange={(v) => setWhere(v)}
              options={[['login', 'Login node'], ['node', `Node ${c.node}`]] as const} />
          : <p className="rounded-xl bg-pill px-4 py-3">Login node</p>}
        <p className="mt-1 text-sm text-dim">{hint}</p>
      </div>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Field label="Start in" value={folder} autoCapitalize="none" autoCorrect="off" spellCheck={false}
            placeholder="~ (your home folder)" onChange={(e) => setFolder(e.target.value)} />
        </div>
        <button aria-label="Choose a folder" disabled={!c} onClick={() => setChoosing(true)}
          className="mb-2 grid size-12 shrink-0 place-items-center rounded-xl bg-pill active:bg-selected">
          <FolderOpen size={22} /></button>
      </div>
      <div className="py-2">
        <span className="mb-1 block text-sm font-bold text-dim">Color</span>
        <div className="flex flex-wrap gap-1">
          {COLORS.map((x) => (
            <button key={x} aria-label={`Color ${x}`} aria-pressed={x === color} onClick={() => setColor(x)}
              className={`grid size-11 place-items-center rounded-full ${x === color ? 'bg-selected' : 'active:bg-hover'}`}>
              <span className="grid size-6 place-items-center rounded-full text-white" style={{ background: x }}>
                {x === color && <Check size={14} />}</span>
            </button>
          ))}
        </div>
      </div>
      {choosing && c && <FolderSheet cluster={c.id} name={c.name} start={folder} onPick={setFolder}
        onClose={() => setChoosing(false)} />}
    </Sheet>
  )
}
