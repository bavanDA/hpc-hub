// Terminals: an activity bar and a panel on the left (your tmux sessions, logs), open terminals on the right.
import { Plus, ScrollText, SquareTerminal, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useListings, useLive } from '../components/terminals/data'
import { NewTerminalDialog } from '../components/terminals/NewTerminal'
import { Dot } from '../components/terminals/Popover'
import { PanelHead, SessionList } from '../components/terminals/SessionList'
import { TabStrip } from '../components/terminals/TabStrip'
import { select, setNotify, useTabs } from '../components/terminals/tabs'
import { TerminalView } from '../components/terminals/TerminalView'
import { useToast } from '../components/toast'
import { EmptyState } from '../components/ui'

type Panel = 'sessions' | 'logs'

function BarButton({ icon: Icon, label, active, badge, onClick }:
  { icon: LucideIcon; label: string; active?: boolean; badge?: number; onClick: () => void }) {
  return (
    <button aria-label={label} title={label} onClick={onClick}
      className={`relative grid size-10 place-items-center rounded-lg ${active ? 'bg-selected' : 'hover:bg-hover'}`}>
      <Icon size={20} />
      {!!badge && <span className="absolute right-0.5 bottom-0.5 grid min-w-4 place-items-center rounded-full
        bg-accent px-1 text-[11px] font-bold text-white">{badge}</span>}
    </button>
  )
}

export function Terminals() {
  const toast = useToast()
  useEffect(() => setNotify(toast), [toast])
  const { tabs, current } = useTabs()
  const live = useLive()
  const { listings, refresh } = useListings(live)
  const [panel, setPanel] = useState<Panel | null>('sessions')
  const [creating, setCreating] = useState(false)
  const logs = tabs.filter((t) => !t.session)
  const toggle = (p: Panel) => setPanel(panel === p ? null : p)
  const newTerminal = () => (live.length ? setCreating(true) : toast('Connect a cluster first'))

  return (
    <div className="flex h-full">
      <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-line py-2">
        <BarButton icon={SquareTerminal} label="Sessions" active={panel === 'sessions'}
          onClick={() => toggle('sessions')} />
        <BarButton icon={ScrollText} label="Logs" active={panel === 'logs'} badge={logs.length}
          onClick={() => toggle('logs')} />
        <BarButton icon={Plus} label="New terminal" onClick={newTerminal} />
      </nav>
      {panel && (
        <aside className="flex w-[290px] shrink-0 flex-col border-r border-line">
          {panel === 'sessions' ? (
            <SessionList live={live} listings={listings} tabs={tabs} current={current} onRefresh={refresh}
              onNew={newTerminal} />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <PanelHead title="Logs" />
              <div className="min-h-0 flex-1 overflow-auto px-2">
                {!logs.length && <p className="px-2 text-[13px] text-dim">VS Code job logs show up here.</p>}
                {logs.map((t) => (
                  <div key={t.key} onClick={() => select(t.key)}
                    className={`flex items-center gap-2.5 rounded-md px-3 py-2 ${
                      t.key === current ? 'bg-selected' : 'hover:bg-hover'}`}>
                    <Dot color={t.color} />
                    <span className="truncate">{t.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      )}
      <section className="flex min-w-0 flex-1 flex-col">
        {tabs.length > 0 && <TabStrip tabs={tabs} current={current} onChanged={refresh} />}
        <div className="relative min-h-0 flex-1">
          {tabs.map((t) => <TerminalView key={t.key} tab={t} shown={t.key === current} />)}
          {!tabs.length && (
            <EmptyState icon={SquareTerminal} title="Nothing open"
              text="Click a session on the left, or start a new terminal." />
          )}
        </div>
      </section>
      {creating && <NewTerminalDialog live={live} onClose={() => setCreating(false)}
        onOpened={() => setTimeout(refresh, 2000)} />}
    </div>
  )
}
