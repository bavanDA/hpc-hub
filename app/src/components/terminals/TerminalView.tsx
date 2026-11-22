import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import '@xterm/xterm/css/xterm.css'

import { useGo } from '../../nav'
import { ChatTitle } from '../chat/ChatTitle'
import { ChatView } from '../chat/ChatView'
import { isClaudeTab, lastView, rememberView } from '../chat/tabs'
import { chatState } from '../chat/useChat'
import { setActiveCluster } from '../clusters/active'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { useToast } from '../useToast'
import { dismiss } from './banners'
import { HistoryFrame } from './history/HistoryFrame'
import { MenuItem } from './MenuItem'
import { MonitorBar } from './MonitorBar'
import { Popover } from './Popover'
import { start, type Tab } from './tabs'
import { copy, paste, rightClickPastes } from './xterm'

export function TerminalView({ tab, shown, rail = false }: { tab: Tab; shown: boolean; rail?: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const toast = useToast()
  const go = useGo()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const claude = isClaudeTab(tab) && tab.cluster !== ''
  const [view, setViewState] = useState<'chat' | 'terminal'>(() => claude ? lastView() : 'terminal')
  const setView = (v: 'chat' | 'terminal') => {
    rememberView(v)
    setViewState(v)
    if (v === 'terminal') requestAnimationFrame(() => { tab.fit.fit(); tab.term.focus() })
  }
  const chat = claude && view === 'chat'

  useEffect(() => {
    const box = host.current!
    box.append(tab.el)  // the same xterm comes back when you return to the page
    if (!tab.term.element) tab.term.open(tab.el)
    start(tab)
    const fit = () => {
      if (box.offsetWidth > 0 && box.offsetHeight > 0 && tab.term.element) tab.fit.fit()
    }
    const watch = new ResizeObserver(() => requestAnimationFrame(fit))
    watch.observe(box)
    // Right click is our Copy and Paste menu: don't let tmux open its own
    const right = (e: MouseEvent) => { if (e.button === 2) e.stopPropagation() }
    box.addEventListener('mousedown', right, true)
    box.addEventListener('mouseup', right, true)
    return () => {
      watch.disconnect()
      box.removeEventListener('mousedown', right, true)
      box.removeEventListener('mouseup', right, true)
      tab.el.remove()
    }
  }, [tab])

  useEffect(() => { if (shown && !chat) tab.term.focus() }, [shown, tab, chat])

  const toggle = claude && (
    <div role="group" aria-label="View" className="flex shrink-0 rounded-lg border border-line-strong p-0.5">
      {(['chat', 'terminal'] as const).map((v) => (
        <button key={v} aria-pressed={view === v} onClick={() => setView(v)}
          className={`h-7 rounded-md px-3 text-sm ${view === v ? 'bg-selected font-semibold' : 'text-dim hover:bg-hover'}`}>
          {v === 'chat' ? 'Chat' : 'Terminal'}</button>
      ))}
    </div>
  )
  const title = claude && <ChatTitle tab={tab} cwd={chatState(tab.key).cwd} />

  const terminal = <div ref={host} className="min-h-0 flex-1 bg-view py-1 pl-2"
    onContextMenu={(e) => {
      e.preventDefault()
      if (rightClickPastes(e)) { paste(tab, toast); tab.term.focus() } else setMenu({ x: e.clientX, y: e.clientY })
    }} />

  return (
    <div className={`absolute inset-0 flex flex-col ${shown ? '' : 'invisible'}`}>
      {tab.banners.map((b) => (
        <div key={b.id} className="flex min-h-11 shrink-0 items-center gap-3 border-b border-line bg-accent/15 py-1 pr-2 pl-4">
          <span className="min-w-0 flex-1 text-center text-sm">{b.text}</span>
          {b.button && <Button kind="suggested" onClick={b.cluster
            ? () => { setActiveCluster(b.cluster!); go('clusters') } : b.action}>{b.button}</Button>}
          <IconButton icon={X} label="Dismiss" size={14} onClick={() => dismiss(tab, b.id)} />
        </div>
      ))}
      {claude && !chat && (
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2">{toggle}{title}</div>
      )}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {rail ? <HistoryFrame tab={tab} shown={shown}>{terminal}</HistoryFrame> : terminal}
        {chat && <ChatView tab={tab} shown={shown} title={title} toggle={toggle} onTerminal={() => setView('terminal')} />}
      </div>
      {tab.session && tab.cluster && <MonitorBar cluster={tab.cluster} session={tab.session} node={tab.node}
        shown={shown} />}
      {menu && (
        <Popover x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <MenuItem onClick={() => { setMenu(null); copy(tab, toast) }}>Copy</MenuItem>
          <MenuItem onClick={() => { setMenu(null); paste(tab, toast); tab.term.focus() }}>Paste</MenuItem>
          <MenuItem onClick={() => { setMenu(null); tab.term.selectAll() }}>Select all</MenuItem>
        </Popover>
      )}
    </div>
  )
}
