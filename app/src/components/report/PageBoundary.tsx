// A page that throws while drawing shows a calm message with Reload and Report instead of a blank window. Around
// each page (keyed by it, so going elsewhere starts clean), and around the whole app (whole: ReportHost may be
// what broke, so it opens the report window itself). header: the page's title bar (phone), kept so the person can
// still open the drawer and go elsewhere.
import { CircleAlert } from 'lucide-react'
import { Component, useState, type ErrorInfo, type ReactNode } from 'react'

import { inTauri } from '../app/platform'
import { EButton } from '../e/EButton'
import { caught } from './catchers'
import { openReport, type ReportStart } from './open'
import { ReportDialog } from './ReportDialog'

type Props = { children: ReactNode; whole?: boolean; header?: ReactNode }

export class PageBoundary extends Component<Props, { error: string }> {
  state = { error: '' }

  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message || e.name : String(e) }
  }

  componentDidCatch(e: unknown, info: ErrorInfo) {
    const message = `A page stopped working: ${PageBoundary.getDerivedStateFromError(e).error}`
    const stack = e instanceof Error ? e.stack ?? '' : ''
    caught({ message, stack }, false)  // kept for the report's log; this page is the message, not a toast
    this.setState({ error: [message, stack, info.componentStack?.trim() ?? ''].filter(Boolean).join('\n\n') })
  }

  render() {
    if (!this.state.error) return this.props.children
    const stopped = <Stopped error={this.state.error} whole={!!this.props.whole} />
    if (!this.props.header) return stopped
    return (
      <div className="flex h-full flex-col">{this.props.header}<div className="min-h-0 flex-1">{stopped}</div></div>
    )
  }
}

function Stopped({ error, whole }: { error: string; whole: boolean }) {
  const [start, setStart] = useState<ReportStart | null>(null)
  const report = () => {
    const r: ReportStart = { kind: 'error', error }
    if (whole) setStart(r)
    else openReport(r)
  }
  return (
    <div role="alert" className="flex h-full flex-col items-center justify-center gap-2 bg-window p-8 text-center">
      <CircleAlert size={28} className="mb-1 text-dim" />
      <h2 className="text-md font-semibold">{whole ? 'HPC Hub stopped working' : 'This page stopped working'}</h2>
      <p className="max-w-[44ch] text-base text-dim">Your clusters, jobs and files are not affected. Reload to start
        it again.</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <EButton onClick={() => location.reload()}>Reload</EButton>
        <EButton kind="primary" onClick={report}>Report it</EButton>
      </div>
      {start && <ReportDialog start={start} onClose={() => setStart(null)} />}
    </div>
  )
}

/** ?crash in the browser demo: the page throws, to see this (design work). */
export function DemoCrash() {
  if (!inTauri && new URLSearchParams(location.search).has('crash')) {
    throw new Error('A test crash, asked for with ?crash')
  }
  return null
}
