// Agents › Running: every agent session on your connected clusters (Claude, ChatGPT, Antigravity, Cursor, Ask all),
// each with its agent's logo. Tap one to open it in Terminals; the three dots rename or stop it.
import { Bot, Copy, ExternalLink, MoreVertical, Pencil, RefreshCw, Square } from 'lucide-react'
import { useState } from 'react'

import { iconOf } from '@shared/components/agents/startable'
import { openLink } from '@shared/components/app/openLink'
import { shortName } from '@shared/components/clusters/loginCopy'
import { useListings, useLive } from '@shared/components/terminals/data'
import { RenameDialog } from '@shared/components/terminals/RenameDialog'
import { tabKey } from '@shared/components/terminals/tabKey'
import { close, openSession, update } from '@shared/components/terminals/tabs'
import { getTab } from '@shared/components/terminals/tabStore'
import { copyText } from '@shared/components/terminals/xterm'
import { Spinner } from '@shared/components/ui/Spinner'
import { useGo } from '@shared/nav'
import { call } from '@shared/rpc'
import { AGENT_NAMES, type TmuxSession } from '@shared/types/terminals'
import { BackLayer, ConfirmDialog, EmptyState, IconBtn, ItemRow, List, Menu, PageBar, useToast } from '../../ui'
import { StartMenu } from './StartMenu'

/** "Claude · thesis" -> "thesis": the agent's name is on the line below. */
function title(s: TmuxSession): string {
  const t = s.title || s.name
  const agent = `${AGENT_NAMES[s.agent]} · `
  return t.startsWith(agent) ? t.slice(agent.length) : t
}

export function Running({ onStart }: { onStart: (cluster: string, name: string, key: string) => void }) {
  const live = useLive()
  const { listings, refresh } = useListings(live)
  const go = useGo()
  const rows: { cluster: string; name: string; s: TmuxSession }[] = []
  for (const c of live) {
    for (const s of listings[c.id]?.listing?.sessions ?? []) {
      if (s.agent && s.agent !== 'term' && AGENT_NAMES[s.agent]) rows.push({ cluster: c.id, name: shortName(c), s })
    }
  }
  const loading = live.some((c) => !listings[c.id])

  return (
    <>
      <PageBar>
        <span className="min-w-0 flex-1 text-dim">{live.length ? '' : 'Connect a cluster to see its agents.'}</span>
        {loading && <Spinner />}
        <IconBtn icon={RefreshCw} label="Refresh" onClick={refresh} />
        <StartMenu onStart={onStart} />
      </PageBar>
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {!rows.length && !loading && <div className="h-[50vh]"><EmptyState icon={Bot} title="No agents running"
          text="An agent runs on a compute node and keeps going when you close the app." /></div>}
        {rows.length > 0 && <List>
          {rows.map(({ cluster, name, s }) => (
            <ItemRow key={`${cluster}/${s.name}`} icon={iconOf(s.agent)} label={title(s)}
              onPress={() => { openSession(cluster, s); go('terminals') }}
              sub={[AGENT_NAMES[s.agent], name, s.node, s.attached ? 'open elsewhere' : ''].filter(Boolean).join(' · ')}
              trailing={<SessionMenu cluster={cluster} s={s} onChanged={refresh} />} />
          ))}
        </List>}
      </div>
    </>
  )
}

/** The three dots of a session: the desktop's menu, and an agent's remote control or ChatGPT's pairing code. */
function SessionMenu({ cluster, s, onChanged }: { cluster: string; s: TmuxSession; onChanged: () => void }) {
  const toast = useToast()
  const [dialog, setDialog] = useState<'rename' | 'stop' | null>(null)
  const target = { cluster, name: s.name, kind: s.kind, node: s.node, title: s.title || s.name }
  const key = tabKey(cluster, s.name)
  const run = (method: string, extra: Record<string, unknown>, after: () => void = () => {}) => {
    call(method, { cluster, session: s.name, node: s.node, ...extra })
      .then(after)
      .catch((e: Error) => toast(`Failed: ${e.message}`))
      .finally(onChanged)
  }
  const remote = s.remote ?? ''
  const pair = remote.startsWith('code:') ? remote.slice(5) : ''
  const others = pair
    ? [{ label: 'Copy ChatGPT pairing code', icon: Copy, onClick: () => copyText(pair).then((ok) =>
        toast(ok ? `Pairing code ${pair} copied. In the ChatGPT app: Codex, connect a machine.` : 'Could not copy')) }]
    : remote.startsWith('http')
      ? [{ label: 'Open in the Claude app', icon: ExternalLink, onClick: () => { openLink(remote)
          .catch((err) => toast(`Could not open it: ${err}`)) } }]
      : []
  return (
    <>
      <Menu label="More" trigger={<MoreVertical size={18} />}
        className="grid size-9 place-items-center rounded-md text-dim active:bg-pressed" groups={[others, [
          { label: 'Rename', icon: Pencil, onClick: () => setDialog('rename') },
          { label: 'Stop session', icon: Square, danger: true, onClick: () => setDialog('stop') },
        ]]} />
      {dialog === 'rename' && (
        <BackLayer onBack={() => setDialog(null)}>
          <RenameDialog target={target} onClose={() => setDialog(null)}
            onRename={(label) => run('terminals.rename', { label, kind: s.kind }, () => update(key, { title: label }))} />
        </BackLayer>
      )}
      {dialog === 'stop' && (
        <ConfirmDialog title={`Stop ${target.title}?`} danger keep="Keep it running" confirm="Stop session"
          text="Everything running in it stops." onClose={() => setDialog(null)}
          onConfirm={() => { if (getTab(key)) close(key); run('terminals.stop', { kind: s.kind }) }} />
      )}
    </>
  )
}
