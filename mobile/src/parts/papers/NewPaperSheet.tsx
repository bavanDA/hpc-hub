// A new LaTeX paper on a cluster: a folder with main.tex and, by default, a git repository (projects.create).
import { useState } from 'react'

import { Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { LatexCluster } from '@shared/types/latex'
import { Field, MainButton, PickerSheet, Row, Sheet, ToggleRow, useToast } from '../../ui'
import { shortCluster } from '../code/util'

export function NewPaperSheet({ clusters, start, onClose, onMade }: { clusters: LatexCluster[]; start: string
  onClose: () => void; onMade: (cluster: string, path: string) => void }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [cluster, setCluster] = useState(start)
  const [parent, setParent] = useState('~/papers')
  const [git, setGit] = useState(true)
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const clusterName = shortCluster(clusters.find((c) => c.id === cluster)?.name ?? cluster)

  const create = () => {
    if (!name.trim() || busy) return
    setBusy(true)
    call<{ path: string; main_tex: string }>('projects.create',
      { cluster, parent, name: name.trim(), template: 'LaTeX paper', git })
      .then((p) => onMade(cluster, p.main_tex ? `${p.path}/${p.main_tex}` : p.path))
      .catch((e: Error) => { toast(e.message); setBusy(false) })
  }

  return (
    <Sheet flush title="New paper" onClose={onClose} actions={
      <MainButton disabled={!name.trim() || busy} onClick={create}>{busy && <Spinner size={18} />} Create</MainButton>}>
      <form className="px-4 pb-3" onSubmit={(e) => { e.preventDefault(); create() }}>
        <Field label="Name" value={name} placeholder="my-paper" autoFocus autoCapitalize="none" autoCorrect="off"
          spellCheck={false} onChange={(e) => setName(e.target.value)} />
        <Field label="In the folder" value={parent} autoCapitalize="none" autoCorrect="off" spellCheck={false}
          onChange={(e) => setParent(e.target.value)} />
      </form>
      <div className="border-t border-line">
        <Row label="Cluster" value={clusterName} opens onPress={() => setPicking(true)} />
        <ToggleRow label="Git repository" checked={git} onChange={setGit} />
      </div>
      {picking && <PickerSheet title="Cluster" value={cluster} onClose={() => setPicking(false)} onPick={setCluster}
        options={clusters.map((c) => ({ value: c.id, label: shortCluster(c.name), hint: c.connected ? undefined : 'Not connected' }))} />}
    </Sheet>
  )
}
