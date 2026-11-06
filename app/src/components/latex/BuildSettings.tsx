import { useState } from 'react'

import { call } from '../../rpc'
import type { Settings } from '../../types/latex'
import { useToast } from '../toast'
import { Button } from '../ui'

const ENGINES: [Settings['engine'], string][] = [['pdf', 'pdfLaTeX'], ['xelatex', 'XeLaTeX'], ['lualatex', 'LuaLaTeX']]

/** Build on save, and the cluster's build settings, saved with their own button. */
export function BuildSettings({ cluster, clusterName, settings, onSettings, auto, onAuto, onClose }:
  { cluster: string; clusterName: string; settings: Settings; onSettings: (s: Settings) => void; auto: boolean
    onAuto: (on: boolean) => void; onClose: () => void }) {
  const toast = useToast()
  const [draft, setDraft] = useState(settings)
  const save = () => {
    call<Settings>('latex.save_settings', { cluster, ...draft })
      .then((s) => { onSettings(s); toast('Build settings saved'); onClose() })
      .catch((e: Error) => toast(`Could not save: ${e.message}`))
  }
  return (
    <div className="flex flex-col gap-3 p-2 text-sm">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={auto} onChange={(e) => onAuto(e.target.checked)} className="accent-accent" />
        Build each time you save
      </label>
      <div className="border-t border-line" />
      <div className="font-semibold">Build on {clusterName}</div>
      <label className="flex flex-col gap-1">
        <span className="text-dim">Engine</span>
        <select value={draft.engine} onChange={(e) => setDraft({ ...draft, engine: e.target.value as Settings['engine'] })}
          className="h-8 rounded-md bg-pill px-2 outline-none">
          {ENGINES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-dim">Before the build</span>
        <input value={draft.setup} placeholder="module load texlive"
          onChange={(e) => setDraft({ ...draft, setup: e.target.value })}
          className="h-8 rounded-md bg-pill px-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus" />
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={draft.on_node} className="accent-accent"
          onChange={(e) => setDraft({ ...draft, on_node: e.target.checked })} />
        Build on my compute node
      </label>
      <div className="flex justify-end">
        <Button kind="primary" className="!h-8 text-sm" onClick={save}>Save settings</Button>
      </div>
    </div>
  )
}
