// Outside React, so a VS Code job keeps opening its folder while another page is shown.
import type { Go } from '../../nav'
import { call, on } from '../../rpc'
import type { Session } from '../../types/clusters'
import type { Follow, Opened, Started, Target, VsStarted, VsStatus } from '../../types/tools'
import { openLink } from '../app/openLink'
import { addBanner } from '../terminals/banners'
import { openCommand, openTmux } from '../terminals/tabs'
import { copyText } from '../terminals/xterm'
import type { ToastOptions } from '../useToast'

type Notify = (text: string, options?: ToastOptions) => void
let notify: Notify = () => {}
export const setNotify = (fn: Notify) => { notify = fn }

const stop = on('tools-progress', (d) => notify((d as { text: string }).text))
import.meta.hot?.dispose(stop)

const failed = (e: Error) => notify(e.message, { kind: 'error' })

/** Run once the cluster is connected: connects it first when it is not */
export async function whenConnected(cluster: string, name: string): Promise<void> {
  const all = await call<Session[]>('sessions.list')
  if (all.find((s) => s.id === cluster)?.connected) return
  const r = await call<{ switch?: { name: string } } | null>('clusters.connect', { cluster })
  if (r?.switch) throw new Error(`Disconnect ${r.switch.name} first, only one VPN can run`)
  notify(`Connecting to ${name}…`)
  await new Promise<void>((resolve, reject) => {
    const off = on('session', (d) => {
      const s = d as Session
      if (s.id !== cluster) return
      if (s.connected) { off(); resolve() }
      else if (s.state === 'Error' || s.state === 'Disconnected') {
        off()
        reject(new Error(s.detail || `Could not connect to ${name}`))
      }
    })
  })
}

type AgentRun = {
  agent: string; name: string; folder: string; chat_id: string; label: string; task: string
  options: Record<string, string>; new_node: boolean; remote_control: boolean; profile: Record<string, unknown> | null
}

export function startAgent(cluster: string, run: AgentRun, go: Go) {
  const { name, ...params } = run
  notify(`Starting ${name}…`)
  call<Started>('tools.agent_start', { cluster, ...params })
    .then((c) => { openTmux(cluster, c); go('terminals') })
    .catch(failed)
}

type AskRun = { folder: string; out: string; prompt: string; agents: string[]; discuss: boolean
  profile: Record<string, unknown> | null; remember: boolean }

export function startAsk(cluster: string, run: AskRun, go: Go) {
  notify(`Asking ${run.agents.length} agents…`)
  call<Started>('tools.ask_start', { cluster, ...run })
    .then((c) => {
      const key = openTmux(cluster, c)
      const out = c.out ?? run.out
      addBanner(key, `Answers go to ${out}`, 'Open folder', () => go('files', { cluster, path: out }))
      go('terminals')
      notify(`Answers go to ${out}`)
    })
    .catch(failed)
}

// -- VS Code ---------------------------------------------------------------------------------------
// One VS Code job per cluster. After you start one (or open the one you have), a watcher asks the backend how far
// it got every few seconds (tools.vscode_status), so the VS Code window can show each step, and it opens the
// folder once the tunnel is up, even with the window closed. Whatever goes wrong is said, never dropped.
function opened(o: Opened) {
  if (o.app) notify('Opening in the VS Code app. The first time, it asks you to sign in with GitHub.')
  else {
    if (o.missing) notify('The VS Code app is not installed here, so it opens in the browser')
    openLink(o.url)
  }
}

/** Open a folder on a tunnel in the VS Code app (if it is here) or the browser. */
export function openTunnel(tunnel: string, folder: string, target: Target) {
  call<Opened>('tools.vscode_open', { tunnel, folder, target }).then(opened)
    .catch((e: Error) => notify(`Could not open VS Code: ${e.message}`, { kind: 'error' }))
}

export type VsWatch = {
  cluster: string; name: string; job: string; folder: string; target: Target; openLinks: boolean
  status: VsStatus | null
  error: string  // the status could not be read
  signedIn: boolean  // a GitHub sign-in was asked for (shown as a step from then on)
  opened: boolean
  web: string  // the forwarded address of code serve-web
}

const watches = new Map<string, VsWatch>()
const listeners = new Map<string, Set<() => void>>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
// cluster -> the newest poll: an answer from an older one is dropped, so overlapping asks never make two loops
const rounds = new Map<string, number>()
const codes = new Set<string>()  // device codes already handled

export const getWatch = (cluster: string) => watches.get(cluster) ?? null

/** Run fn whenever the cluster's VS Code watch changes; answers the way to stop. */
export function onWatch(cluster: string, fn: () => void): () => void {
  const set = listeners.get(cluster) ?? new Set()
  listeners.set(cluster, set)
  set.add(fn)
  return () => { set.delete(fn) }
}

const watched = (cluster: string) => (listeners.get(cluster)?.size ?? 0) > 0

function changed(w: VsWatch) {
  watches.set(w.cluster, { ...w })
  for (const fn of listeners.get(w.cluster) ?? []) fn()
}

/** Watch this VS Code job: shows its steps and opens folder in target once its tunnel is up. */
export function watchVscode(cluster: string, name: string, job: string, folder: string, target: Target,
  openLinks: boolean, alreadyOpen = false): VsWatch {
  const old = watches.get(cluster)
  const same = old?.job === job
  changed({ cluster, name, job, folder, target, openLinks, status: same ? old.status : null, error: '',
    signedIn: same ? old.signedIn : false, opened: alreadyOpen, web: same ? old.web : '' })
  poll(cluster, 0)
  return watches.get(cluster)!
}

export function forgetWatch(cluster: string) {
  clearTimeout(timers.get(cluster))
  rounds.set(cluster, (rounds.get(cluster) ?? 0) + 1)  // an answer still on its way is dropped
  watches.delete(cluster)
  for (const fn of listeners.get(cluster) ?? []) fn()
}

/** Ask again after ms; any ask already waiting is replaced. */
function later(cluster: string, ms: number, failures = 0) {
  clearTimeout(timers.get(cluster))
  timers.set(cluster, setTimeout(() => poll(cluster, failures), ms))
}

function poll(cluster: string, failures: number) {
  clearTimeout(timers.get(cluster))
  const w = watches.get(cluster)
  if (!w) return
  const round = (rounds.get(cluster) ?? 0) + 1
  rounds.set(cluster, round)
  const current = () => rounds.get(cluster) === round && watches.get(cluster)?.job === w.job
  call<VsStatus>('tools.vscode_status', { cluster, job: w.job })
    .then((st) => { if (current()) step(watches.get(cluster)!, st) })
    .catch((e: Error) => {
      if (!current()) return
      const now = watches.get(cluster)!
      if (failures < 2) { later(cluster, 3000, failures + 1); return }
      changed({ ...now, error: `Could not check the VS Code job: ${e.message}` })
      if (!watched(cluster)) notify(`${w.name}: could not check the VS Code job: ${e.message}`, { kind: 'error' })
    })
}

function step(w: VsWatch, st: VsStatus) {
  const next: VsWatch = { ...w, status: st, error: '' }
  const quiet = !watched(w.cluster)  // the window is closed: say what matters in a toast instead
  if (st.device && !codes.has(st.device.code)) {
    codes.add(st.device.code)
    next.signedIn = true
    const device = st.device
    copyText(device.code).then((copied) => {
      if (quiet) notify(`VS Code on ${w.name}: sign in to GitHub with code ${device.code}${copied ? ' (copied)' : ''}`,
        { stay: true, action: { label: 'Open GitHub', run: () => openLink(device.url) } })
    })
  }
  if (st.phase === 'ready' && !w.opened) {
    next.opened = true
    openTunnel(st.tunnel, w.folder || st.home, w.target)
  }
  if (st.web && !w.web) {
    call<string>('tools.forward', { cluster: w.cluster, url: st.web, job: w.job })
      .then((url) => {
        const now = watches.get(w.cluster)
        if (now) changed({ ...now, web: url })
        if (w.openLinks) openLink(url)
      })
      .catch((e: Error) => notify(`VS Code web: the port forward failed: ${e.message}`, { kind: 'error' }))
  }
  if (st.phase === 'ended' && quiet) notify(`${w.name}: ${st.problem}`, { kind: 'error' })
  if (st.stuck && !w.status?.stuck && quiet) {  // once: it would wait forever
    notify(`${w.name}: ${st.problem} Open VS Code to stop it and pick another queue.`, { kind: 'error' })
  }
  changed(next)
  // keep asking until VS Code runs (or the job ended); with the window open, also while its server installs
  const more = st.phase !== 'ended' && (st.phase !== 'ready' || (!quiet && !st.server))
  if (more) later(w.cluster, st.phase === 'queued' ? 5000 : 3000)
}

/** The VS Code job's whole log in a terminal tab. */
export function showLog(cluster: string, f: Follow, go: Go) {
  openCommand(f.title, f.argv, f.color, '', cluster)
  go('terminals')
}

export type VsRun = { folder: string; target: Target; job: string; replace_job: boolean
  profile: Record<string, unknown> | null; remember: boolean; remember_folder: boolean; ask?: boolean }

/** Submit the VS Code job (or use the one you have) and watch it. Throws what went wrong, for the window. */
export async function startVscode(cluster: string, name: string, run: VsRun, openLinks: boolean): Promise<VsWatch> {
  const r = await call<VsStarted>('tools.vscode_start', { cluster, ...run })
  if (r.open) opened(r.open)
  return watchVscode(cluster, name, r.job, r.folder, r.target, openLinks, Boolean(r.open))
}

export async function stopVscode(cluster: string, job: string) {
  await call('tools.vscode_stop', { cluster, job })
  forgetWatch(cluster)
}
