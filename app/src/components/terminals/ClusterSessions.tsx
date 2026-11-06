import { shortName } from '../clusters/loginCopy'
import type { Listed, Live } from './data'
import { ListNote } from './ListNote'
import { SessionRow } from './SessionRow'
import { withOpened } from './sessionText'
import { tabKey, type Tab } from './tabs'

export function ClusterSessions({ cluster, listed, tabs, current, onRefresh }:
  { cluster: Live; listed?: Listed; tabs: Tab[]; current: string | null; onRefresh: () => void }) {
  const listing = listed?.listing
  const items = withOpened(listing?.sessions ?? [], tabs, cluster.id)
  const tip = listing?.host ? 'Sessions are kept by tmux, so they survive closing the app. Agents run tmux on ' +
    `their compute node and end with its job; older sessions may still be on ${listing.host}.` : undefined
  return (
    <div className="mb-2">
      <h3 title={tip} className="border-b border-line px-4 pt-4 pb-1.5 text-xs font-semibold tracking-wide text-dim
        uppercase">{shortName(cluster)}</h3>
      {!listing && listed?.error && <ListNote>{listed.error}</ListNote>}
      {!listing && !listed?.error && !items.length && <ListNote>Loading…</ListNote>}
      {listing && !listing.has_tmux && !items.length && <ListNote>tmux is not installed here.</ListNote>}
      {listing && listing.has_tmux && !items.length && <ListNote>No sessions yet.</ListNote>}
      {items.map((s) => (
        <SessionRow key={s.name} cluster={cluster.id} s={s} nodes={listing?.nodes ?? null}
          open={tabs.some((t) => t.key === tabKey(cluster.id, s.name))}
          selected={current === tabKey(cluster.id, s.name)} onRefresh={onRefresh} />
      ))}
    </div>
  )
}
