// Recompile, like Overleaf's green button, with its menu: build on save, and the cluster's build settings.
import { ChevronDown, RefreshCw } from 'lucide-react'
import { useState } from 'react'

import { call } from '../../rpc'
import type { Settings } from '../../types/latex'
import { useToast } from '../toast'
import { Button, Spinner } from '../ui'
import { Popover } from './bits'

const ENGINES: [Settings['engine'], string][] = [['pdf', 'pdfLaTeX'], ['xelatex', 'XeLaTeX'], ['lualatex', 'LuaLaTeX']]

export function BuildButton({ cluster, clusterName, running, settings, onSettings, auto, onAuto, onBuild }:
  { cluster: string; clusterName: string; running: boolean; settings: Settings; onSettings: (s: Settings) => void;
    auto: boolean; onAuto: (on: boolean) => void; onBuild: () => void }) {
  const toast = useToast()
  const [draft, setDraft] = useState(settings)
  const save = (close: () => void) => {
    call<Settings>('latex.save_settings', { cluster, ...draft })
      .then((s) => { onSettings(s); toast('Build settings saved'); close() })
      .catch((e: Error) => toast(`Could not save: ${e.message}`))
  }
  return (
    <div className="flex">
      <Button kind="suggested" onClick={onBuild} disabled={running} title="Save and build (Ctrl+Enter)"
        className="!h-8 rounded-r-none !px-3 text-sm">
        {running ? <Spinner size={14} /> : <RefreshCw size={14} />} {running ? 'Compiling' : 'Recompile'}</Button>
      <Popover width={330} button={(open, toggle) => (
        <button onClick={() => { if (!open) setDraft(settings); toggle() }} aria-label="Build settings"
          title="Build settings"
          className="grid h-8 w-7 place-items-center rounded-r-md border-l border-white/25 bg-accent text-white
            hover:brightness-110"><ChevronDown size={14} /></button>
      )}>
        {(close) => (
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
              Build on my compute node, if I have one
            </label>
            <div className="flex justify-end">
              <Button kind="suggested" className="!h-8 text-sm" onClick={() => save(close)}>Save settings</Button>
            </div>
          </div>
        )}
      </Popover>
    </div>
  )
}
