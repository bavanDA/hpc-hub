// The Sessions panel: tmux sessions per connected cluster. Click one to open it on the right.
import { PanelLeftClose, Plus, RefreshCw } from 'lucide-react'

import { sessionKind, type TmuxSession } from '../../types/terminals'
import { useToast } from '../toast'
import { shortName } from '../clusters/loginCopy'
import { IconButton } from '../ui'
import type { Listed, Live } from './data'
import { SessionIcon } from './Popover'
import { SessionMenu } from './SessionMenu'
import { openLink } from './pty'
import { openSession, tabKey, type Tab } from './tabs'
import { copyText } from './xterm'

function ago(ts: number): string {
  if (!ts) return ''
  const m = Math.floor(Math.max(0, Date.now() / 1000 - ts) / 60)
  return m < 60 ? `${m} min` : m < 48 * 60 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} days`
}

export function PanelHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 pr-2 pl-4">
      <h2 className="flex-1 font-semibold">{title}</h2>
      {children}
    </div>
  )
}

export function SessionList({ live, listings, tabs, current, onRefresh, onNew, onHide }: {
  live: Live[]; listings: Record<string, Listed>; tabs: Tab[]; current: string | null
  onRefresh: () => void; onNew: () => void; onHide?: () => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHead title="Sessions">
        <IconButton icon={RefreshCw} label="Refresh" size={16} onClick={onRefresh} />
        <IconButton icon={Plus} label="New terminal" onClick={onNew} />
        {onHide && <IconButton icon={PanelLeftClose} label="Hide sessions" onClick={onHide} />}
      </PanelHead>
      <div className="min-h-0 flex-1 overflow-auto pb-2">
        {!live.length && <Note>Connect a cluster to see its sessions.</Note>}
        {live.map((c) => (
          <ClusterSessions key={c.id} cluster={c} listed={listings[c.id]} tabs={tabs} current={current}
            onRefresh={onRefresh} />
        ))}
      </div>
      <p className="px-4 pb-3 text-sm text-dim">
        Sessions keep running when you close a tab.
      </p>
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="border-b border-line px-4 py-2.5 text-sm text-dim">{children}</p>
}

function ClusterSessions({ cluster, listed, tabs, current, onRefresh }:
  { cluster: Live; listed?: Listed; tabs: Tab[]; current: string | null; onRefresh: () => void }) {
  const listing = listed?.listing
  const items = [...(listing?.sessions ?? [])]
  // Just started here, not listed yet
  for (const t of tabs) {
    if (t.cluster === cluster.id && t.session && !items.some((s) => s.name === t.session)) {
      items.unshift({ name: t.session, kind: t.kind, created: 0, attached: 1, label: t.title, color: t.color,
        command: '', windows: 1, path: '', remote: '', node: t.node, title: t.title, agent: 'term', job: '' })
    }
  }
  const tip = listing?.host ? 'Sessions are kept by tmux, so they survive closing the app. Agents run tmux on ' +
    `their compute node and end with its job; older sessions may still be on ${listing.host}.` : undefined
  return (
    <div className="mb-2">
      <h3 title={tip} className="border-b border-line px-4 pt-4 pb-1.5 text-xs font-semibold tracking-wide text-dim
        uppercase">{shortName(cluster)}</h3>
      {!listing && listed?.error && <Note>{listed.error}</Note>}
      {!listing && !listed?.error && !items.length && <Note>Loading…</Note>}
      {listing && !listing.has_tmux && !items.length && <Note>tmux is not installed here.</Note>}
      {listing && listing.has_tmux && !items.length && <Note>No sessions yet.</Note>}
      {items.map((s) => (
        <SessionRow key={s.name} cluster={cluster.id} s={s} nodes={listing?.nodes ?? null}
          open={tabs.some((t) => t.key === tabKey(cluster.id, s.name))}
          selected={current === tabKey(cluster.id, s.name)} onRefresh={onRefresh} />
      ))}
    </div>
  )
}

function SessionRow({ cluster, s, nodes, open, selected, onRefresh }: {
  cluster: string; s: TmuxSession; nodes: Record<string, string> | null; open: boolean; selected: boolean
  onRefresh: () => void
}) {
  const toast = useToast()
  let state = open ? 'open' : s.attached ? 'open elsewhere' : 'running'
  let node = s.node
  if (!node && s.job && nodes) {
    node = nodes[s.job] ?? 'node released'
    if (node === 'node released' && state === 'running') state = ''
  }
  const what = sessionKind(s)
  const title = s.title.startsWith(`${what} · `) ? s.title.slice(what.length + 3) : s.title
  const bits = [title.startsWith(what) ? '' : what, node, ago(s.created), state].filter(Boolean)  // not VS Code twice
  const code = s.remote.startsWith('code:')
  const remoteAction = () => {
    if (!code) return openLink(s.remote)
    copyText(s.remote.slice(5)).then(() =>
      toast(`Pairing code ${s.remote.slice(5)} copied. In the ChatGPT app: Codex, connect a machine.`))
  }
  return (
    <div onClick={() => openSession(cluster, s)} title={`${s.name} (${s.kind})${s.path ? ` in ${s.path}` : ''}`}
      className={`flex min-h-12 items-center gap-3 border-b border-line py-1.5 pr-1.5 pl-4 ${
        selected ? 'bg-selected' : 'hover:bg-hover active:bg-pressed'}`}>
      <SessionIcon agent={s.agent} session={s.name} />
      <div className="min-w-0 flex-1">
        <div className="break-words">{title}</div>
        <div className="text-sm break-words text-dim">{bits.join(' · ')}</div>
      </div>
      {(code || s.remote.startsWith('http')) && (
        <button onClick={(e) => { e.stopPropagation(); remoteAction() }}
          title={code ? `Copy pairing code ${s.remote.slice(5)}` : `Open remote: ${s.remote}`}
          className="h-8 shrink-0 rounded-md border border-line-strong px-2.5 text-sm font-semibold hover:bg-hover">
          {code ? 'Copy code' : 'Open'}</button>
      )}
      <SessionMenu target={{ cluster, name: s.name, kind: s.kind, node: s.node, title: s.title }} onChanged={onRefresh} />
    </div>
  )
}
