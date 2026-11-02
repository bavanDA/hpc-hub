// New terminal: name, cluster, login or compute node, folder. It runs in tmux. Style E: fields, segmented picks,
// one main button.
import { useState } from 'react'

import { shortName } from '../clusters/loginCopy'
import { EDialog, Field, MainButton, Segments } from '../e/ui'
import { useToast } from '../toast'
import type { Live } from './data'
import { openNew } from './tabs'

function Pick({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="py-1.5">
      <p className="mb-1.5 text-sm text-dim">{label}</p>
      {children}
      {hint && <p className="mt-1.5 text-sm text-dim">{hint}</p>}
    </div>
  )
}

export function NewTerminalDialog({ live, cluster: start = '', onClose, onOpened }:
  { live: Live[]; cluster?: string; onClose: () => void; onOpened: () => void }) {
  const toast = useToast()
  const [name, setName] = useState(() => `Terminal ${new Date().toTimeString().slice(0, 5)}`)
  const [picked, setCluster] = useState(start)
  const c = live.find((x) => x.id === picked) ?? live[0]
  const cluster = c?.id ?? ''
  const [node, setOnNode] = useState<boolean | null>(null)  // null: the compute node when there is one
  const onNode = node ?? Boolean(c?.node)
  const [folder, setFolder] = useState('~')

  const create = () => {
    onClose()
    openNew(cluster, { name: name.trim() || 'Terminal', node: onNode && Boolean(c?.node), folder: folder.trim() || '~',
      color: '' }).then(onOpened).catch((e: Error) => toast(`Could not open the terminal: ${e.message}`))
  }
  const where = onNode && c?.node ? 'node' : 'login'
  const places = c?.node ? [['login', 'Login node'], ['node', `Node ${c.node}`]] as const : [['login', 'Login node']] as const

  return (
    <EDialog title="New terminal" onClose={onClose}
      actions={<MainButton disabled={!cluster} onClick={create}>Open terminal</MainButton>}>
      <div className="flex flex-col gap-1 px-5">
        <p className="pb-1 text-dim">It keeps running when you close the tab or the app.</p>
        <Field label="Name" autoFocus value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()} />
        {live.length > 1 && <Pick label="Cluster">
          <Segments label="Cluster" value={cluster} options={live.map((x) => [x.id, shortName(x)] as const)}
            onChange={(id) => { setCluster(id); setOnNode(null) }} />
        </Pick>}
        <Pick label="Run on" hint={where === 'node' ? 'Your own node, for real work.'
          : c?.node ? "The login node is for editing and submitting jobs. Don't run heavy work there."
            : "No compute node right now, so it runs on the login node. Don't run heavy work there."}>
          <Segments label="Run on" value={where} options={places} onChange={(v) => setOnNode(v === 'node')} />
        </Pick>
        <Field label="Start in" value={folder} onChange={(e) => setFolder(e.target.value)}
          placeholder="~ (your home folder)" />
      </div>
    </EDialog>
  )
}
