// A new LaTeX paper on a cluster: a folder with main.tex and, by default, a git repository (projects.create).
import { useState } from 'react'

import { Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { LatexCluster } from '@shared/types/latex'
import { Button, Card, Field, ListRow, PickerSheet, Sheet, Switch, useToast } from '../../ui'

export function NewPaperSheet({ clusters, start, onClose, onMade }: { clusters: LatexCluster[]; start: string
  onClose: () => void; onMade: (cluster: string, path: string) => void }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [cluster, setCluster] = useState(start)
  const [parent, setParent] = useState('~/papers')
  const [git, setGit] = useState(true)
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const clusterName = clusters.find((c) => c.id === cluster)?.name ?? cluster

  const create = () => {
    if (!name.trim() || busy) return
    setBusy(true)
    call<{ path: string; main_tex: string }>('projects.create',
      { cluster, parent, name: name.trim(), template: 'LaTeX paper', git })
      .then((p) => onMade(cluster, p.main_tex ? `${p.path}/${p.main_tex}` : p.path))
      .catch((e: Error) => { toast(e.message); setBusy(false) })
  }

  return (
    <Sheet title="New paper" onClose={onClose} actions={<>
      <Button className="flex-1" onClick={onClose}>Cancel</Button>
      <Button kind="primary" className="flex-1" disabled={!name.trim() || busy} onClick={create}>
        {busy && <Spinner size={18} />} Create</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); create() }}>
        <Field label="Name" value={name} placeholder="my-paper" autoFocus autoCapitalize="none" autoCorrect="off"
          spellCheck={false} onChange={(e) => setName(e.target.value)} />
        <Field label="In the folder" value={parent} autoCapitalize="none" autoCorrect="off" spellCheck={false}
          onChange={(e) => setParent(e.target.value)} />
      </form>
      <Card className="mt-2 py-1">
        <ListRow title="Cluster" subtitle={clusterName} onClick={() => setPicking(true)} />
        <Switch label="Start a git repository" hint="Also makes a .gitignore for LaTeX build files."
          checked={git} onChange={setGit} />
      </Card>
      {picking && <PickerSheet title="Cluster" value={cluster} onClose={() => setPicking(false)} onPick={setCluster}
        options={clusters.map((c) => ({ value: c.id, label: c.name, hint: c.connected ? undefined : 'Not connected' }))} />}
    </Sheet>
  )
}
