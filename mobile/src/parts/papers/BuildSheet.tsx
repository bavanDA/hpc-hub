// How a paper builds on its cluster: the engine, a command to run first (module load texlive), whether to build on
// your compute node, and whether to build each time you save (kept on this phone).
import { useState } from 'react'

import { Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { Settings } from '@shared/types/latex'
import { Field, MainButton, PickerSheet, Row, Section, Sheet, ToggleRow, useToast } from '../../ui'
import { shortCluster } from '../code/util'

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
    <Sheet flush title="Build settings" onClose={onClose} actions={
      <MainButton disabled={busy} onClick={save}>{busy && <Spinner size={18} />} Save</MainButton>}>
      <div className="border-t border-line">
        <ToggleRow label="Build each time you save" checked={auto} onChange={onAuto} />
      </div>
      <Section title={`On ${shortCluster(clusterName)}`}>
        <Row label="Engine" value={ENGINES.find((e) => e.value === draft.engine)?.label} opens
          onPress={() => setPicking(true)} />
        <ToggleRow label="Build on my compute node" checked={draft.on_node}
          onChange={(on) => setDraft({ ...draft, on_node: on })} />
      </Section>
      <div className="px-4 pt-3">
        <Field label="Run before the build" value={draft.setup} placeholder="module load texlive"
          autoCapitalize="none" autoCorrect="off" spellCheck={false}
          onChange={(e) => setDraft({ ...draft, setup: e.target.value })} />
      </div>
      {picking && <PickerSheet title="Engine" value={draft.engine} options={ENGINES} onClose={() => setPicking(false)}
        onPick={(engine) => setDraft({ ...draft, engine })} />}
    </Sheet>
  )
}
