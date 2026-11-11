// The open folder's terminals, over the bottom of the file: the desktop's panel on a phone. It lists them in a window
// instead of beside the terminal, and has the row of keys. They are tmux sessions, so hiding it leaves them running.
import { ChevronDown, Plus, SquareTerminal, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { agentIcon } from '@shared/components/agents/AgentIcon'
import { about } from '@shared/components/code/desktop/about'
import type { FolderSessions } from '@shared/components/code/desktop/folderSessions'
import { Note } from '@shared/components/code/desktop/Note'
import { usePanelTabs } from '@shared/components/code/desktop/panel'
import type { Live } from '@shared/components/terminals/data'
import { tabKey } from '@shared/components/terminals/tabKey'
import { setNotify } from '@shared/components/terminals/tabNotify'
import { openNew, openSession } from '@shared/components/terminals/tabs'
import { useTabs } from '@shared/components/terminals/useTabs'
import { Button } from '@shared/components/ui/Button'
import { IconButton } from '@shared/components/ui/IconButton'
import { Spinner } from '@shared/components/ui/Spinner'
import type { TmuxSession } from '@shared/types/terminals'
import { Dialog, Row, Section, useToast } from '../../ui'
import { KeyBar } from '../terminal/KeyBar'
import { TerminalPane } from '../terminal/TerminalPane'

const iconOf = (agent: string) => ['claude', 'codex', 'agy', 'cursor'].includes(agent) ? agentIcon(agent) : SquareTerminal

export function TerminalPanel({ cluster, live, folder, name, home, sessions, onHide }: {
  cluster: string; live: Live | null; folder: string; name: string; home: string; sessions: FolderSessions
  onHide: () => void
}) {
  const toast = useToast()
  useEffect(() => setNotify(toast), [toast])
  const { tabs } = useTabs()
  const panel = usePanelTabs(cluster, folder)
  const mine = panel.keys.map((k) => tabs.find((t) => t.key === k)).filter((t) => t !== undefined)
  const on = mine.find((t) => t.key === panel.current) ?? mine[mine.length - 1]
  const [listing, setListing] = useState(false)

  const open = (s: TmuxSession) => {
    openSession(cluster, s)
    panel.add(tabKey(cluster, s.name))
  }
  const start = (onNode: boolean) => {
    const taken = new Set([...sessions.here.map((s) => s.title), ...mine.map((t) => t.title)])
    let title = name
    for (let n = 2; taken.has(title); n++) title = `${name} ${n}`
    openNew(cluster, { name: title, node: onNode, folder, color: '' })
      .then((key) => { panel.add(key); setTimeout(sessions.refresh, 2000) })
      .catch((e: Error) => toast(`Couldn't open the terminal: ${e.message}`))
  }
  const node = live?.node ?? ''
  const listed = sessions.listed

  const row = (s: TmuxSession) => (
    <Row key={s.name} icon={iconOf(s.agent)} label={s.title} sub={about(s, folder, home)}
      onPress={() => { setListing(false); open(s) }} />
  )

  return (
    <div className="relative flex h-[42%] min-h-[200px] shrink-0 flex-col border-t border-line bg-window">
      <div className="flex h-9 shrink-0 items-center gap-0.5 pr-1">
        <span className="min-w-0 flex-1 truncate pl-4 text-xs font-semibold tracking-wide text-dim uppercase">
          {on ? on.title : 'Terminal'}</span>
        <IconButton icon={Plus} label={`New terminal in ${name}`} className="!size-8" disabled={!live}
          onClick={() => start(Boolean(node))} />
        <IconButton icon={ChevronDown} label="Running terminals" className="!size-8" disabled={!live}
          onClick={() => { sessions.refresh(); setListing(true) }} />
        <IconButton icon={X} label="Hide" className="!size-8" onClick={onHide} />
      </div>
      <div className="relative min-h-0 flex-1">
        {mine.map((t) => <TerminalPane key={t.key} tab={t} shown={t.key === on?.key} monitor={false} />)}
        {!on && (!live ? <Note>Connect to use terminals here.</Note>
          : !listed?.listing && listed?.error ? <Note>{listed.error}</Note>
          : !listed?.listing ? <div className="grid h-full place-items-center"><Spinner /></div>
          : !listed.listing.has_tmux ? <Note>tmux is not installed on this cluster.</Note>
          : sessions.here.length ? <Note>Pick a terminal with the arrow, or start a new one with +.</Note>
          : (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <span className="text-dim">Nothing running in {name}.</span>
              <Button size="sm" kind="primary" onClick={() => start(Boolean(node))}><Plus size={14} /> New terminal</Button>
            </div>
          ))}
      </div>
      {on && <KeyBar tab={on} />}
      {listing && (
        <Dialog title="Terminals" onClose={() => setListing(false)}>
          <Section title={`In ${name}`}>
            {sessions.here.length ? sessions.here.map(row) : <p className="px-5 py-3 text-sm text-dim">Nothing running here.</p>}
          </Section>
          {sessions.others.length > 0 && <Section title="Other folders">{sessions.others.map(row)}</Section>}
          <Section>
            {node && <Row icon={SquareTerminal} label={`New terminal on ${node}`} onPress={() => { setListing(false); start(true) }} />}
            <Row icon={SquareTerminal} label="New terminal on the login node" onPress={() => { setListing(false); start(false) }} />
          </Section>
        </Dialog>
      )}
    </div>
  )
}
