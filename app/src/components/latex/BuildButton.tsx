import { ChevronDown, Download, RefreshCw } from 'lucide-react'

import type { Settings } from '../../types/latex'
import { Button } from '../ui/Button'
import { Spinner } from '../ui/Spinner'
import { BuildSettings } from './BuildSettings'
import type { DownloadState } from './pdfDownload'
import { Popover } from './ui/Popover'

export type PdfDownload = DownloadState & { download: () => void }

export function BuildButton({ cluster, clusterName, running, settings, onSettings, auto, onAuto, onBuild, pdf }:
  { cluster: string; clusterName: string; running: boolean; settings: Settings; onSettings: (s: Settings) => void;
    auto: boolean; onAuto: (on: boolean) => void; onBuild: () => void; pdf: PdfDownload }) {
  return (
    <div className="flex">
      <Button kind="primary" onClick={onBuild} disabled={running} title="Save and build (Ctrl+Enter)"
        className="!h-8 rounded-r-none !px-3 text-sm">
        {running ? <Spinner size={14} /> : <RefreshCw size={14} />} {running ? 'Compiling' : 'Recompile'}</Button>
      <Popover width={330} button={(_, toggle) => (
        <button onClick={toggle} aria-label="Download PDF and build settings" title="Download PDF, build settings"
          className="grid h-8 w-7 place-items-center rounded-r-md border-l border-on-accent/25 bg-accent text-on-accent
            hover:bg-accent-hover"><ChevronDown size={14} /></button>
      )}>
        {(close) => <>
          <button onClick={() => { close(); pdf.download() }} disabled={!pdf.ok} title={pdf.why}
            className="flex w-full items-start gap-2 rounded-md p-2 text-left text-sm hover:bg-hover
              disabled:opacity-50 disabled:hover:bg-transparent">
            <Download size={14} className="mt-0.5 shrink-0" />
            <span className="min-w-0"><span className="block">Download PDF</span>
              {!pdf.ok && <span className="block text-xs text-dim">{pdf.why}</span>}</span>
          </button>
          <div className="mx-2 mb-1 border-t border-line" />
          <BuildSettings cluster={cluster} clusterName={clusterName} settings={settings} onSettings={onSettings}
            auto={auto} onAuto={onAuto} onClose={close} />
        </>}
      </Popover>
    </div>
  )
}
