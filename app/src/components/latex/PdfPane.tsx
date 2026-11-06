import type { BuildDone, Issue } from '../../types/latex'
import type { PdfTarget } from '../pdf'
import { ReadablePdf } from '../pdf/ReadAloud'
import { counts } from './issues'
import { Logs } from './Logs'
import { LogsButton } from './LogsButton'
import { PdfMessage } from './PdfMessage'
import type { PdfState } from './useBuiltPdf'

type Props = {
  cluster: string
  main: string
  pdf: PdfState
  progress: number
  build: { running: boolean; log: string; last: BuildDone | null; stop: () => void }
  logsOpen: boolean
  onLogs: (open: boolean) => void
  reader: boolean  // the Reader view, where the logs stay closed
  target: PdfTarget | null
  focused: boolean
  onFocus: (on: boolean) => void
  onSync: (page: number, x: number, y: number) => void
  onGo: (i: Issue) => void
  latex: { cluster: string; main: string }
}

/** The PDF, or the build logs in its place. */
export function PdfPane({ cluster, main, pdf, progress, build, logsOpen, onLogs, reader, target, focused, onFocus,
  onSync, onGo, latex }: Props) {
  if (logsOpen && !reader) {
    return <Logs running={build.running} log={build.log} last={build.last} onGo={onGo} onClose={() => onLogs(false)}
      onStop={build.stop} />
  }
  const { errors, warnings } = counts(build.last?.issues ?? [])
  return <ReadablePdf data={pdf.data} source={pdf.path ? { cluster, path: pdf.path } : undefined}
    memory={`latex:${cluster}:${main}`} onSync={onSync} target={target}
    extra={<LogsButton open={logsOpen} errors={errors} warnings={warnings} onClick={() => onLogs(!logsOpen)} />}
    focus={focused} onFocus={onFocus} reflow={reader} latex={latex}
    loading={!pdf.none && !pdf.error} progress={progress}
    message={pdf.none ? <PdfMessage title="No PDF yet" text="Press Recompile to build it on the cluster." />
      : pdf.error ? <PdfMessage title="Could not read the PDF" text={pdf.error} /> : undefined} />
}
