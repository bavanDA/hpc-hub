// New terminal: a name, the cluster, the login node or your compute node (with what each is for) and the folder it
// starts in. It runs in tmux, so it keeps going when you leave it.
import { useState } from 'react'

import { shortName } from '@shared/components/clusters/loginCopy'
import type { Live } from '@shared/components/terminals/data'
import { openNew } from '@shared/components/terminals/tabs'
import { FolderField } from '../agents/FolderField'
import { Field, List, MainButton, Row, Segments, Sheet, useToast } from '../../ui'


export function NewTerminalSheet({ live, cluster: first = '', folder: startIn = '', onClose, onOpened }:
  { live: Live[]; cluster?: string; folder?: string; onClose: () => void; onOpened: () => void }) {
  const toast = useToast()
  const [name, setName] = useState(() => `Terminal ${new Date().toTimeString().slice(0, 5)}`)
  const [picked, setPicked] = useState(first)
  const c = live.find((x) => x.id === picked) ?? live[0]
  const [where, setWhere] = useState<'login' | 'node' | ''>('')  // '': the node when there is one
  const onNode = Boolean(c?.node) && (where || (c?.node ? 'node' : 'login')) === 'node'
  const [folder, setFolder] = useState(startIn || '~')

  const open = () => {
    if (!c) return
    onClose()
    openNew(c.id, { name: name.trim() || 'Terminal', node: onNode, folder: folder.trim() || '~', color: '' })
      .then(onOpened).catch((e: Error) => toast(`Could not open the terminal: ${e.message}`))
  }

  const hint = onNode ? 'Your own compute node, for real work.'
    : 'Shared with everyone. Fine for editing files and submitting jobs, not for heavy work.'
  return (
    <Sheet title="New terminal" flush onClose={onClose}
      actions={<MainButton disabled={!c} onClick={open}>Open terminal</MainButton>}>
      <div className="px-4">
        <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        {live.length > 1 && (
          <div className="py-2">
            <span className="mb-1.5 block text-sm text-dim">Cluster</span>
            <Segments label="Cluster" value={c?.id ?? ''} options={live.map((x) => [x.id, shortName(x)] as const)}
              onChange={(id) => { setPicked(id); setWhere('') }} />
          </div>
        )}
        {c?.node && (
          <div className="py-2">
            <span className="mb-1.5 block text-sm text-dim">Run on</span>
            <Segments label="Run on" value={onNode ? 'node' : 'login'} onChange={(v) => setWhere(v)}
              options={[['login', 'Login node'], ['node', `Node ${c.node}`]] as const} />
            <p className="mt-1.5 text-sm text-dim">{hint}</p>
          </div>
        )}
      </div>
      {!c?.node && (
        <List className="mt-3">
          <Row label="Runs on" value="Login node" sub={hint} />
        </List>
      )}
      <div className="px-4 pt-2">
        {c && <FolderField cluster={c.id} name={shortName(c)} label="Start in" value={folder} onChange={setFolder} />}
        <p className="pt-2 text-sm text-dim">It keeps running when you leave it or close the app.</p>
      </div>
    </Sheet>
  )
}
