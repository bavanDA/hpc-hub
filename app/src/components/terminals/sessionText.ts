import { sessionKind, type TmuxSession } from '../../types/terminals'
import type { Tab } from './tabs'

/** How long ago: "5 min", "3 h", "2 days"; '' when not known. */
export function ago(ts: number, now = Date.now() / 1000): string {
  if (!ts) return ''
  const m = Math.floor(Math.max(0, now - ts) / 60)
  return m < 60 ? `${m} min` : m < 48 * 60 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} days`
}

/** The cluster's sessions, with ones just opened here in front until tmux lists them. */
export function withOpened(sessions: TmuxSession[], tabs: Tab[], cluster: string): TmuxSession[] {
  const items = [...sessions]
  for (const t of tabs) {
    if (t.cluster === cluster && t.session && !items.some((s) => s.name === t.session)) {
      items.unshift({ name: t.session, kind: t.kind, created: 0, attached: 1, label: t.title, color: t.color,
        command: '', windows: 1, path: '', remote: '', node: t.node, title: t.title, agent: 'term', job: '' })
    }
  }
  return items
}

/** A session row's title and its grey line: what runs, where, since when and whether it is open. */
export function sessionLines(s: TmuxSession, open: boolean, nodes: Record<string, string> | null, now?: number) {
  let state = open ? 'open' : s.attached ? 'open elsewhere' : 'running'
  let node = s.node
  if (!node && s.job && nodes) {
    node = nodes[s.job] ?? 'node released'
    if (node === 'node released' && state === 'running') state = ''
  }
  const what = sessionKind(s)
  const title = s.title.startsWith(`${what} · `) ? s.title.slice(what.length + 3) : s.title
  const bits = [title.startsWith(what) ? '' : what, node, ago(s.created, now), state].filter(Boolean)
  return { title, sub: bits.join(' · ') }
}
