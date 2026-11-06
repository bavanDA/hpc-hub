import type { Cluster, Session } from '../../types/clusters'
import { setActiveCluster } from '../clusters/active'
import { shortName } from '../clusters/loginCopy'
import { SessionDot } from '../clusters/SessionDot'
import type { Page } from './pages'
import { leftText, useTimeLeft } from './watch'

export function FooterLine({ c, s, onPick }: { c: Cluster; s: Session; onPick: (p: Page) => void }) {
  const left = useTimeLeft(c.id, s.job ?? '')
  const what = !s.connected ? (s.state === 'Connected' ? 'VPN only' : s.state)
    : s.node ? [s.node, left !== null && leftText(left)].filter(Boolean).join(' · ') : 'no node'
  return (
    <button onClick={() => { setActiveCluster(c.id); onPick('clusters') }} title={`${c.name}: ${what}`}
      className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left hover:bg-hover">
      <SessionDot session={s} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{shortName(c)}</span>
        <span className={`block truncate text-xs ${left !== null && left <= 15 * 60 ? 'font-semibold text-text' : 'text-dim'}`}>
          {what}</span>
      </span>
    </button>
  )
}
