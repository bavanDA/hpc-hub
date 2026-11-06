import { PanelLeftOpen, SquareTerminal } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useListings, useLive } from '../components/terminals/data'
import { NewTerminalDialog } from '../components/terminals/NewTerminal'
import { SessionList } from '../components/terminals/SessionList'
import { TabStrip } from '../components/terminals/TabStrip'
import { setNotify, useTabs } from '../components/terminals/tabs'
import { TerminalView } from '../components/terminals/TerminalView'
import { useToast } from '../components/useToast'
import { Button, EmptyState, IconButton } from '../components/ui'
import { usePageParams } from '../nav'

let listShown = true  // kept while you visit other pages

export function Terminals() {
  const toast = useToast()
  useEffect(() => setNotify(toast), [toast])
  const { tabs, current } = useTabs()
  const live = useLive()
  const { listings, refresh } = useListings(live)
  const [list, setListState] = useState(listShown)
  const setList = (on: boolean) => { listShown = on; setListState(on) }
  const params = usePageParams()  // { cluster, new: '1', folder? }: a cluster card's or a project's Terminal
  const [creating, setCreating] = useState(params.new === '1')
  const newTerminal = () => (live.length ? setCreating(true) : toast('Connect a cluster first'))

  return (
    <div className="flex h-full">
      {list ? (
        <aside className="flex w-[290px] shrink-0 flex-col border-r border-line">
          <SessionList live={live} listings={listings} tabs={tabs} current={current} onRefresh={refresh}
            onNew={newTerminal} onHide={() => setList(false)} />
        </aside>
      ) : (
        <div className="flex shrink-0 flex-col items-center border-r border-line px-1 py-2">
          <IconButton icon={PanelLeftOpen} label="Show sessions" onClick={() => setList(true)} />
        </div>
      )}
      <section className="flex min-w-0 flex-1 flex-col">
        {tabs.length > 0 && <TabStrip tabs={tabs} current={current} onChanged={refresh} />}
        <div className="relative min-h-0 flex-1">
          {tabs.map((t) => <TerminalView key={t.key} tab={t} shown={t.key === current} />)}
          {!tabs.length && (
            <EmptyState icon={SquareTerminal} title="Nothing open"
              text={list ? 'Click a session on the left, or start a new terminal.' : 'Start a new terminal.'}
              action={<Button kind="primary" onClick={newTerminal}>New terminal</Button>} />
          )}
        </div>
      </section>
      {creating && live.length > 0 && <NewTerminalDialog live={live} cluster={params.cluster}
        folder={params.folder} onClose={() => setCreating(false)}
        onOpened={() => setTimeout(refresh, 2000)} />}
    </div>
  )
}
