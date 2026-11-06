import { useState } from 'react'

import { shortName } from '../clusters/loginCopy'
import { EDialog } from '../e/EDialog'
import { Field } from '../e/Field'
import { MainButton } from '../e/MainButton'
import { Segments } from '../e/Segments'
import { useToast } from '../useToast'
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

export function NewTerminalDialog({ live, cluster: start = '', folder: startIn = '', onClose, onOpened }:
  { live: Live[]; cluster?: string; folder?: string; onClose: () => void; onOpened: () => void }) {
  const toast = useToast()
  const [name, setName] = useState(() => `Terminal ${new Date().toTimeString().slice(0, 5)}`)
  const [picked, setCluster] = useState(start)
  const c = live.find((x) => x.id === picked) ?? live[0]
  const cluster = c?.id ?? ''
  const [node, setOnNode] = useState<boolean | null>(null)  // null: the compute node when there is one
  const onNode = node ?? Boolean(c?.node)
  const [folder, setFolder] = useState(startIn || '~')

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
        <Field label="Name" autoFocus value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()} />
        {live.length > 1 && <Pick label="Cluster">
          <Segments label="Cluster" value={cluster} options={live.map((x) => [x.id, shortName(x)] as const)}
            onChange={(id) => { setCluster(id); setOnNode(null) }} />
        </Pick>}
        <Pick label="Run on" hint={where === 'node' ? 'Your own compute node. Best for builds, scripts and heavy work.'
          : c?.node ? 'Shared with everyone on the cluster. Best for editing files and submitting jobs.'
            : "You have no compute node yet, so this opens on the shared login node. It's best for editing files and "
              + 'submitting jobs.'}>
          <Segments label="Run on" value={where} options={places} onChange={(v) => setOnNode(v === 'node')} />
        </Pick>
        <Field label="Start in" value={folder} onChange={(e) => setFolder(e.target.value)}
          placeholder="~ (your home folder)" />
      </div>
    </EDialog>
  )
}
