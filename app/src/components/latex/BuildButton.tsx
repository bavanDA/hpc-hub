import { ChevronDown, RefreshCw } from 'lucide-react'

import type { Settings } from '../../types/latex'
import { Button } from '../ui/Button'
import { Spinner } from '../ui/Spinner'
import { BuildSettings } from './BuildSettings'
import { Popover } from './ui/Popover'

export function BuildButton({ cluster, clusterName, running, settings, onSettings, auto, onAuto, onBuild }:
  { cluster: string; clusterName: string; running: boolean; settings: Settings; onSettings: (s: Settings) => void;
    auto: boolean; onAuto: (on: boolean) => void; onBuild: () => void }) {
  return (
    <div className="flex">
      <Button kind="primary" onClick={onBuild} disabled={running} title="Save and build (Ctrl+Enter)"
        className="!h-8 rounded-r-none !px-3 text-sm">
        {running ? <Spinner size={14} /> : <RefreshCw size={14} />} {running ? 'Compiling' : 'Recompile'}</Button>
      <Popover width={330} button={(_, toggle) => (
        <button onClick={toggle} aria-label="Build settings" title="Build settings"
          className="grid h-8 w-7 place-items-center rounded-r-md border-l border-on-accent/25 bg-accent text-on-accent
            hover:bg-accent-hover"><ChevronDown size={14} /></button>
      )}>
        {(close) => <BuildSettings cluster={cluster} clusterName={clusterName} settings={settings} onSettings={onSettings}
          auto={auto} onAuto={onAuto} onClose={close} />}
      </Popover>
    </div>
  )
}
