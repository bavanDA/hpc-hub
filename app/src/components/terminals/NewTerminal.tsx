// New terminal: name, cluster, login or compute node, folder, color. It runs in tmux.
import { useState } from 'react'

import { useToast } from '../toast'
import { Button, Dialog } from '../ui'
import type { Live } from './data'
import { inputClass } from './SessionMenu'
import { openNew } from './tabs'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-dim">{label}</span>
      {children}
      {hint && <span className="text-sm text-dim">{hint}</span>}
    </label>
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

  return (
    <Dialog title="New terminal" onClose={onClose}>
      <p className="mb-4 text-dim">It keeps running when you close the tab or the app.</p>
      <div className="flex flex-col gap-4">
        <Field label="Name">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputClass}
            onKeyDown={(e) => e.key === 'Enter' && create()} />
        </Field>
        <Field label="Cluster">
          <select value={cluster} className={inputClass} onChange={(e) => {
            setCluster(e.target.value)
            setOnNode(null)
          }}>
            {live.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>
        <Field label="Run on" hint={onNode && c?.node ? 'Your own node, for real work.'
          : c?.node ? "The login node is for editing and submitting jobs. Don't run heavy work there."
            : "No compute node right now, so it runs on the login node. Don't run heavy work there."}>
          <select value={onNode && c?.node ? 'node' : 'login'} className={inputClass}
            onChange={(e) => setOnNode(e.target.value === 'node')}>
            <option value="login">Login node (shared)</option>
            {c?.node && <option value="node">Compute node {c.node} (job {c.job})</option>}
          </select>
        </Field>
        <Field label="Start in">
          <input value={folder} onChange={(e) => setFolder(e.target.value)} className={inputClass}
            spellCheck={false} placeholder="~ (your home folder)" />
        </Field>
      </div>
      <div className="mt-6 mb-2 flex justify-center">
        <Button kind="primary" disabled={!cluster} onClick={create}>Open terminal</Button>
      </div>
    </Dialog>
  )
}
