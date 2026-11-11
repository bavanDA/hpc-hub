// How a paper builds on its cluster: build on save, the engine, a command to run first (module load texlive), and
// whether to build on your compute node. The build-on-save choice stays on this phone.
import { useState } from 'react'

import { SelectField } from '@shared/components/e/SelectField'
import { Spinner } from '@shared/components/ui/Spinner'
import { call } from '@shared/rpc'
import type { Settings } from '@shared/types/latex'
import { Button, Dialog, Field, ToggleRow, useToast } from '../../ui'

const ENGINES: [Settings['engine'], string][] = [['pdf', 'pdfLaTeX'], ['xelatex', 'XeLaTeX'], ['lualatex', 'LuaLaTeX']]

export function BuildDialog({ cluster, clusterName, settings, auto, onAuto, onSaved, onClose }: {
  cluster: string; clusterName: string; settings: Settings; auto: boolean; onAuto: (on: boolean) => void
  onSaved: (s: Settings) => void; onClose: () => void
}) {
  const toast = useToast()
  const [draft, setDraft] = useState(settings)
  const [busy, setBusy] = useState(false)
  const save = () => {
    setBusy(true)
    call<Settings>('latex.save_settings', { cluster, ...draft })
      .then((s) => { onSaved(s); toast('Build settings saved'); onClose() })
      .catch((e: Error) => { toast(`Could not save: ${e.message}`); setBusy(false) })
  }
  return (
    <Dialog title="Build settings" width={440} onClose={onClose} actions={<>
      <Button className="flex-1" onClick={onClose}>Cancel</Button>
      <Button kind="primary" className="flex-1" disabled={busy} onClick={save}>
        {busy && <Spinner size={16} />} Save settings</Button>
    </>}>
      <div className="border-t border-line">
        <ToggleRow label="Build each time you save" checked={auto} onChange={onAuto} />
      </div>
      <p className="px-5 pt-3 text-sm font-semibold">Build on {clusterName}</p>
      <div className="px-5">
        <SelectField label="Engine" value={draft.engine} options={ENGINES}
          onChange={(engine) => setDraft({ ...draft, engine })} />
        <Field label="Before the build" value={draft.setup} placeholder="module load texlive" autoCapitalize="none"
          autoCorrect="off" onChange={(e) => setDraft({ ...draft, setup: e.target.value })} />
      </div>
      <div className="mt-1 border-t border-line">
        <ToggleRow label="Build on my compute node" checked={draft.on_node}
          onChange={(on) => setDraft({ ...draft, on_node: on })} />
      </div>
    </Dialog>
  )
}
