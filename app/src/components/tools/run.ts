// Outside React, so a VS Code job keeps opening its folder while another page is shown.
import type { Go } from '../../nav'
import { call, on } from '../../rpc'
import type { Session } from '../../types/clusters'
import type { Link } from '../../types/terminals'
import type { Opened, Started, Target, VsStarted } from '../../types/tools'
import { openLink } from '../terminals/pty'
import { addBanner } from '../terminals/banners'
import { getTab, select } from '../terminals/tabStore'
import { openCommand, openTmux } from '../terminals/tabs'

let notify: (text: string) => void = () => {}
export const setNotify = (fn: (text: string) => void) => { notify = fn }

const stop = on('tools-progress', (d) => notify((d as { text: string }).text))
import.meta.hot?.dispose(stop)

const failed = (e: Error) => notify(e.message)

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

function opened(o: Opened) {
  if (o.app) notify('Opening in VS Code. First time, sign in with GitHub in VS Code.')
  else {
    if (o.missing) notify('VS Code app not found, opening in the browser')
    openLink(o.url)
  }
}

/** Open a folder on a tunnel in the VS Code app (if it is here) or the browser. */
function openTunnel(tunnel: string, folder: string, target: Target) {
  call<Opened>('tools.vscode_open', { tunnel, folder, target }).then(opened).catch(failed)
}

// cluster -> the VS Code job whose log a tab follows, and the folder to open once its tunnel is up
const following = new Map<string, { job: string; key: string }>()
const pending = new Map<string, { folder: string; target: Target }>()

/** https://vscode.dev/tunnel/<name>/home/jdoe -> /home/jdoe */
const tunnelHome = (url: string) => '/' + (new URL(url).pathname.split('/').slice(3).join('/'))

function onLink(cluster: string, job: string, key: string, openLinks: boolean, openIn: Target) {
  return (link: Link) => {
    if (link.kind === 'tunnel' && link.tunnel) {
      const name = link.tunnel, home = tunnelHome(link.url)
      addBanner(key, 'VS Code is ready', 'Open VS Code', () => openTunnel(name, home, openIn))
      const p = pending.get(cluster)
      pending.delete(cluster)
      if (p) openTunnel(name, p.folder, p.target)
      else if (openLinks) openTunnel(name, home, openIn)
    } else if (link.kind === 'device-login') {
      if (openLinks) openLink(link.url)
    } else if (link.kind === 'local-web') {
      call<string>('tools.forward', { cluster, url: link.url, job })
        .then((url) => {
          addBanner(key, `VS Code web is at ${url}`, 'Open', () => openLink(url))
          if (openLinks) openLink(url)
        })
        .catch((e: Error) => addBanner(key, `Port forward failed: ${e.message}`))
    }
  }
}

type VsRun = { folder: string; target: Target; job: string; replace_job: boolean
  profile: Record<string, unknown> | null; remember: boolean; remember_folder: boolean; ask?: boolean }

export function startVscode(cluster: string, run: VsRun, openLinks: boolean, _go?: Go) {
  if (!run.job || run.replace_job) notify(run.job ? `Stopping VS Code job ${run.job}…` : 'Submitting the VS Code job…')
  call<VsStarted>('tools.vscode_start', { cluster, ...run })
    .then((r) => {
      if (r.open) return opened(r.open)
      if (!r.follow) return
      notify(r.submitted ? `VS Code job ${r.submitted} is starting. It opens by itself when it's ready.`
        : "VS Code is starting. It opens by itself when it's ready.")
      pending.set(cluster, { folder: r.folder, target: r.target })
      const f = following.get(cluster)
      if (f && f.job === r.follow.job && getTab(f.key)) {
        select(f.key)  // already following it; the tunnel link opens the folder
      } else {
        const { argv, title, color, job } = r.follow
        const key: string = openCommand(title, argv, color, '', cluster,
          (link) => onLink(cluster, job, key, openLinks, r.target)(link))
        following.set(cluster, { job, key })
      }
      // you stay where you are: the job's log is in Terminals, and the folder opens once the tunnel is up
    })
    .catch(failed)
}
