// The VS Code job's steps, live: the queue, starting, the GitHub code to type, VS Code installing on the node and
// running, with what went wrong, Open, Show log and Stop. VsCodeDialog shows it once there is a job.
import { Check, Copy, ExternalLink, Square, TerminalSquare, TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { useGo } from '../../nav'
import type { Target, VsStatus } from '../../types/tools'
import { openLink } from '../app/openLink'
import { EButton } from '../e/EButton'
import { List } from '../e/List'
import { ReportLink } from '../report/ReportLink'
import { copyText } from '../terminals/xterm'
import { Spinner } from '../ui/Spinner'
import { useToast } from '../useToast'
import { openTunnel, showLog, stopVscode, type VsWatch } from './run'


export function Problem({ text, tail, action }: { text: string; tail?: string[]; action?: ReactNode }) {
  return (
    <div role="alert" className="mx-5 mt-3 rounded-lg bg-bad-bg px-4 py-3 text-bad">
      <div className="flex items-start gap-2 font-semibold"><TriangleAlert size={18} className="mt-0.5 shrink-0" />
        <span className="flex-1">{text}</span></div>
      {tail && tail.length > 0 && (
        <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-window p-2 font-mono text-xs whitespace-pre-wrap
          text-text">{tail.join('\n')}</pre>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">{action}<ReportLink className="text-sm" error={text} /></div>
    </div>
  )
}

/** No VS Code job yet: the folder, where it opens, and the node it asks for. */

type StepState = 'done' | 'now' | 'todo' | 'bad'

function Step({ state, title, sub, children }:
  { state: StepState; title: string; sub?: ReactNode; children?: ReactNode }) {
  const mark = {
    done: <span className="grid size-6 place-items-center rounded-full bg-ok-bg text-ok"><Check size={14} /></span>,
    now: <span className="grid size-6 place-items-center"><Spinner size={18} /></span>,
    todo: <span className="block size-6 rounded-full border-2 border-line-strong" />,
    bad: <span className="grid size-6 place-items-center rounded-full bg-bad-bg text-bad"><TriangleAlert size={13} /></span>,
  }[state]
  return (
    <div className="flex gap-3 px-4 py-3">
      <div className="shrink-0 pt-0.5">{mark}</div>
      <div className="min-w-0 flex-1">
        <div className={state === 'todo' ? 'text-dim' : 'font-semibold'}>{title}</div>
        {sub && <div className="text-sm text-dim">{sub}</div>}
        {children}
      </div>
    </div>
  )
}

const ORDER = ['queued', 'starting', 'login', 'ready'] as const

function when(start: string) {
  const t = new Date(start)
  if (Number.isNaN(t.getTime())) return ''
  const mins = Math.round((t.getTime() - Date.now()) / 60000)
  const clock = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return mins <= 1 ? 'any moment now' : mins < 90 ? `in about ${mins} min (${clock})` : `around ${clock}`
}

const WAIT: Record<string, string> = { Priority: 'other jobs are ahead', Resources: 'waiting for a free node' }

/** The job's steps, live, with the GitHub code to type when it asks, and Open, Show log and Stop. */
export function Progress({ w, onNew, onClose }: { w: VsWatch; onNew: () => void; onClose: () => void }) {
  const go = useGo()
  const toast = useToast()
  const [stopping, setStopping] = useState<'ask' | 'busy' | ''>('')
  const st: VsStatus | null = w.status
  const phase = st?.phase
  const at = phase && phase !== 'ended' ? ORDER.indexOf(phase) : -1
  const past = (p: typeof ORDER[number]): StepState =>
    at > ORDER.indexOf(p) ? 'done' : at === ORDER.indexOf(p) ? 'now' : 'todo'
  const ended = phase === 'ended'
  const where = w.target === 'desktop' ? 'the VS Code app' : 'the browser'
  const other: Target = w.target === 'desktop' ? 'browser' : 'desktop'

  async function stop() {
    setStopping('busy')
    try {
      await stopVscode(w.cluster, w.job)
      toast(`Stopped VS Code job ${w.job}`)
      onClose()
    } catch (e) {
      toast(`Could not stop VS Code job ${w.job}: ${(e as Error).message}`, { kind: 'error' })
      setStopping('')
    }
  }

  /** A job that can never start: stop it, and the form comes back to pick another queue or priority. */
  async function stopAndChange() {
    setStopping('busy')
    try {
      await stopVscode(w.cluster, w.job)  // forgets the watch, so the window shows the form again
      onNew()
    } catch (e) {
      toast(`Could not stop VS Code job ${w.job}: ${(e as Error).message}`, { kind: 'error' })
      setStopping('')
    }
  }

  const queued = st?.reason ? `In the queue (${WAIT[st.reason] ?? st.reason})` : 'In the queue'
  const ready = phase === 'ready' && st
  return <>
    {w.error && <Problem text={w.error} />}
    {ended && st && <Problem text={st.problem} tail={st.tail}
      action={<EButton small icon={TerminalSquare} onClick={() => showLog(w.cluster, st.follow, go)}>
        Show the whole log</EButton>} />}
    {!ended && st?.stuck && <Problem text={`${st.problem} It would wait forever.`}
      action={<EButton small kind="primary" disabled={stopping === 'busy'} onClick={stopAndChange}>
        {stopping === 'busy' ? 'Stopping…' : 'Stop and change'}</EButton>} />}
    {!ended && st?.problem && !st.stuck && <Problem text={`The job may be stuck: ${st.problem}`} tail={st.tail} />}
    <div className="pt-3">
      <List>
        <Step state="done" title={`Job ${w.job} submitted`} sub={`Opens ${w.folder || '~'} in ${where}`} />
        {!ended && <>
          <Step state={!st ? 'now' : st.stuck ? 'bad' : past('queued')} title="Waiting for a compute node"
            sub={!st ? 'Checking…' : phase === 'queued'
              ? `${queued}.${st.start ? ` Slurm expects it to start ${when(st.start)}.` : ''}`
              : st.node ? `Running on ${st.node}` : undefined} />
          <Step state={past('starting')} title="Starting the VS Code tunnel"
            sub={phase === 'starting' ? 'Getting VS Code ready on the node. This takes a few seconds.' : undefined} />
          {(w.signedIn || phase === 'login') && (
            <Step state={past('login')} title="Sign in to GitHub"
              sub={phase === 'login' ? 'Only the first time: GitHub lets the tunnel run as you.' : 'Signed in'}>
              {phase === 'login' && st?.device && <DeviceCode device={st.device} />}
            </Step>
          )}
          <Step state={phase !== 'ready' ? 'todo' : st?.installing ? 'now' : 'done'}
            title={phase !== 'ready' ? `Open in ${where}` : st?.installing ? 'Installing VS Code on the node'
              : st?.server ? 'VS Code is running' : `Opened in ${where}`}
            sub={!ready ? undefined : st.installing
              ? 'The first time, VS Code downloads its server to the cluster. This takes a minute or two, '
                + 'nothing is wrong.'
              : st.server ? `Tunnel ${st.tunnel}. You can close this: VS Code keeps running in its job.`
              : w.target === 'desktop'
                ? `Tunnel ${st.tunnel}. The first time, the VS Code app installs Remote - Tunnels and asks you `
                  + 'to sign in with GitHub.'
                : `Tunnel ${st.tunnel}. The first time, vscode.dev asks you to sign in with GitHub.`} />
        </>}
      </List>
    </div>
    {w.web && <p className="px-5 pt-3 text-sm text-dim">VS Code web is at <button type="button"
      className="text-accent underline" onClick={() => openLink(w.web)}>{w.web}</button></p>}
    <div className="flex flex-wrap items-center gap-2 px-5 pt-3">
      {st && <EButton kind="quiet" small icon={TerminalSquare} onClick={() => showLog(w.cluster, st.follow, go)}>
        Show log</EButton>}
      {!ended && (stopping === 'ask'
        ? <><span className="text-sm font-semibold">Stop job {w.job}?</span>
          <EButton small onClick={() => setStopping('')}>Keep it</EButton>
          <EButton small kind="danger" onClick={stop}>Stop</EButton></>
        : <EButton kind="quiet" small icon={Square} disabled={stopping === 'busy'} onClick={() => setStopping('ask')}>
          {stopping === 'busy' ? 'Stopping…' : 'Stop job'}</EButton>)}
    </div>
    <div className="flex flex-wrap items-center justify-end gap-2 px-5 pt-2 pb-3">
      {ended ? <EButton kind="primary" onClick={onNew}>Start a new one</EButton>
        : ready ? <>
          <EButton onClick={() => openTunnel(st.tunnel, w.folder || st.home, other)}>
            {other === 'browser' ? 'Open in the browser' : 'Open in the app'}</EButton>
          <EButton kind="primary" icon={ExternalLink} onClick={() => openTunnel(st.tunnel, w.folder || st.home, w.target)}>
            Open again</EButton></>
        : !st?.stuck && <EButton kind="primary" onClick={onClose}>Keep going in the background</EButton>}
    </div>
  </>
}

/** The code to type on github.com/login/device, big, with Copy and Open. */
function DeviceCode({ device }: { device: { url: string; code: string } }) {
  const [copied, setCopied] = useState(false)
  const copy = () => copyText(device.code).then(setCopied)
  return (
    <div className="mt-2 flex flex-col gap-3 rounded-lg bg-pill p-4">
      <ol className="list-decimal pl-5 text-sm">
        <li>Copy this code.</li>
        <li>Open GitHub, sign in, and paste it.</li>
        <li>Click Authorize. This window goes on by itself.</li>
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-lg bg-window px-4 py-2 font-mono text-2xl font-semibold tracking-[0.2em] select-all">
          {device.code || '…'}</code>
        <EButton icon={copied ? Check : Copy} disabled={!device.code} onClick={copy}>{copied ? 'Copied' : 'Copy'}</EButton>
        <EButton kind="primary" icon={ExternalLink} onClick={() => { copy(); openLink(device.url) }}>Open GitHub</EButton>
      </div>
    </div>
  )
}
