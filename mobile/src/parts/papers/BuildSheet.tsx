// How a paper builds on its cluster: the engine, a command to run first (module load texlive), whether to build on
// your compute node, and whether to build each time you save (kept on this phone).
import { useState } from 'react'

import { Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { Settings } from '@shared/types/latex'
import { Button, Card, Field, ListRow, PickerSheet, Sheet, Switch, useToast } from '../../ui'

const ENGINES: { value: Settings['engine']; label: string }[] = [
  { value: 'pdf', label: 'pdfLaTeX' }, { value: 'xelatex', label: 'XeLaTeX' }, { value: 'lualatex', label: 'LuaLaTeX' }]

export function BuildSheet({ cluster, clusterName, settings, auto, onAuto, onSaved, onClose }: {
  cluster: string; clusterName: string; settings: Settings; auto: boolean; onAuto: (on: boolean) => void
  onSaved: (s: Settings) => void; onClose: () => void
}) {
  const toast = useToast()
  const [draft, setDraft] = useState(settings)
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const save = () => {
    setBusy(true)
    call<Settings>('latex.save_settings', { cluster, ...draft })
      .then((s) => { onSaved(s); toast('Build settings saved'); onClose() })
      .catch((e: Error) => { toast(`Couldn't save: ${e.message}`); setBusy(false) })
  }
  return (
    <Sheet title="Build settings" onClose={onClose} actions={<>
      <Button className="flex-1" onClick={onClose}>Cancel</Button>
      <Button kind="primary" className="flex-1" disabled={busy} onClick={save}>
        {busy && <Spinner size={18} />} Save</Button></>}>
      <Card className="py-1">
        <Switch label="Build each time you save" checked={auto} onChange={onAuto} />
      </Card>
      <h2 className="mt-5 mb-2 text-sm font-bold text-dim">On {clusterName}</h2>
      <Card className="py-1">
        <ListRow title="Engine" subtitle={ENGINES.find((e) => e.value === draft.engine)?.label}
          onClick={() => setPicking(true)} />
        <Switch label="Build on my compute node" hint="When you have one. Otherwise on the login node."
          checked={draft.on_node} onChange={(on) => setDraft({ ...draft, on_node: on })} />
      </Card>
      <Field label="Run before the build" value={draft.setup} placeholder="module load texlive"
        autoCapitalize="none" autoCorrect="off" spellCheck={false}
        onChange={(e) => setDraft({ ...draft, setup: e.target.value })} />
      {picking && <PickerSheet title="Engine" value={draft.engine} options={ENGINES} onClose={() => setPicking(false)}
        onPick={(engine) => setDraft({ ...draft, engine })} />}
    </Sheet>
  )
}
