import { useState } from 'react'

import { call } from '../../../rpc'
import type { LatexCluster } from '../../../types/latex'
import { useToast } from '../../useToast'
import { Button, Dialog, FIELD, Spinner } from '../../ui'
import { ClusterSelect } from './ClusterSelect'
import { openPath } from './papers'

export function NewPaper({ clusters, start, onClose, onMade }: { clusters: LatexCluster[]; start: string;
  onClose: () => void; onMade: (cluster: string, path: string) => void }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [cluster, setCluster] = useState(start)
  const [parent, setParent] = useState('~/papers')
  const [git, setGit] = useState(true)
  const [busy, setBusy] = useState(false)
  const go = () => {
    if (!name.trim() || busy) return
    setBusy(true)
    call<{ path: string; main_tex: string }>('projects.create', { cluster, parent, name, template: 'LaTeX paper', git })
      .then((p) => onMade(cluster, openPath(p)))
      .catch((e: Error) => { toast(e.message); setBusy(false) })
  }
  const field = `${FIELD} w-full`
  return (
    <Dialog title="New paper" onClose={onClose} width={440}
      actions={<><Button onClick={onClose}>Cancel</Button>
        <Button kind="primary" disabled={!name.trim() || busy} onClick={go}>{busy && <Spinner size={14} />} Create</Button></>}>
      <div className="flex flex-col gap-3 text-base">
        <label className="flex flex-col gap-1"><span className="text-sm text-dim">Name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="my-paper"
            onKeyDown={(e) => e.key === 'Enter' && go()} className={field} /></label>
        <label className="flex flex-col gap-1"><span className="text-sm text-dim">Cluster</span>
          <ClusterSelect clusters={clusters} value={cluster} onChange={setCluster} /></label>
        <label className="flex flex-col gap-1"><span className="text-sm text-dim">In the folder</span>
          <input value={parent} onChange={(e) => setParent(e.target.value)} className={`${field} font-mono text-sm`} />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={git} onChange={(e) => setGit(e.target.checked)} className="accent-accent" />
          Start a git repository</label>
        <p className="text-sm text-dim">Makes main.tex and a .gitignore for LaTeX build files.</p>
      </div>
    </Dialog>
  )
}
