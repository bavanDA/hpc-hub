// A new LaTeX paper on a cluster: a folder with main.tex and, by default, a git repository (projects.create).
import { useState } from 'react'

import { SelectField } from '@shared/components/e/SelectField'
import { openPath } from '@shared/components/latex/picker/papers'
import { Spinner } from '@shared/components/ui/Spinner'
import { call } from '@shared/rpc'
import type { LatexCluster } from '@shared/types/latex'
import { Button, Dialog, Field, ToggleRow, useToast } from '../../ui'

export function NewPaperDialog({ clusters, start, onClose, onMade }: { clusters: LatexCluster[]; start: string
  onClose: () => void; onMade: (cluster: string, path: string) => void }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [cluster, setCluster] = useState(start)
  const [parent, setParent] = useState('~/papers')
  const [git, setGit] = useState(true)
  const [busy, setBusy] = useState(false)
  const create = () => {
    if (!name.trim() || busy) return
    setBusy(true)
    call<{ path: string; main_tex: string }>('projects.create',
      { cluster, parent, name: name.trim(), template: 'LaTeX paper', git })
      .then((p) => onMade(cluster, openPath(p)))
      .catch((e: Error) => { toast(e.message); setBusy(false) })
  }
  return (
    <Dialog title="New paper" width={440} onClose={onClose} actions={<>
      <Button className="flex-1" onClick={onClose}>Cancel</Button>
      <Button kind="primary" className="flex-1" disabled={!name.trim() || busy} onClick={create}>
        {busy && <Spinner size={16} />} Create</Button>
    </>}>
      <form className="px-5" onSubmit={(e) => { e.preventDefault(); create() }}>
        <Field label="Name" value={name} placeholder="my-paper" autoFocus autoCapitalize="none" autoCorrect="off"
          onChange={(e) => setName(e.target.value)} />
        <SelectField label="Cluster" value={cluster} onChange={setCluster}
          options={clusters.map((c) => [c.id, `${c.name}${c.connected ? '' : ' (not connected)'}`] as const)} />
        <Field label="In the folder" value={parent} autoCapitalize="none" autoCorrect="off"
          onChange={(e) => setParent(e.target.value)} />
      </form>
      <div className="mt-1 border-t border-line">
        <ToggleRow label="Start a git repository" checked={git} onChange={setGit}
          sub="Makes main.tex and a .gitignore for LaTeX build files." />
      </div>
    </Dialog>
  )
}
