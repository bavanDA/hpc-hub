import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import '@xterm/xterm/css/xterm.css'

import { useToast } from '../useToast'
import { Button, IconButton } from '../ui'
import { MonitorBar } from './MonitorBar'
import { MenuItem, Popover } from './Popover'
import { dismiss } from './banners'
import { start, type Tab } from './tabs'
import { copy, paste } from './xterm'

export function TerminalView({ tab, shown }: { tab: Tab; shown: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const toast = useToast()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

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

  useEffect(() => { if (shown) tab.term.focus() }, [shown, tab])

  return (
    <div className={`absolute inset-0 flex flex-col ${shown ? '' : 'invisible'}`}>
      {tab.banners.map((b) => (
        <div key={b.id} className="flex min-h-11 shrink-0 items-center gap-3 border-b border-line bg-accent/15 py-1 pr-2 pl-4">
          <span className="min-w-0 flex-1 text-center text-sm">{b.text}</span>
          {b.button && <Button kind="suggested" onClick={b.action}>{b.button}</Button>}
          <IconButton icon={X} label="Dismiss" size={14} onClick={() => dismiss(tab, b.id)} />
        </div>
      ))}
      <div ref={host} className="min-h-0 flex-1 bg-view py-1 pl-2"
        onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }) }} />
      {tab.session && tab.cluster && <MonitorBar cluster={tab.cluster} node={tab.node} shown={shown} />}
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
