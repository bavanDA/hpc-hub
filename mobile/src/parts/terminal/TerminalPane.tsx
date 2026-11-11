// One open terminal: its xterm, what happened to its connection (the desktop's banners, Reconnect included), and the
// monitoring bar. The same xterm comes back when you return. Each terminal stays attached while you look elsewhere:
// it sits in this pane unless a pane on screen (the Code page's panel) has taken it.
import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

import '@xterm/xterm/css/xterm.css'

import { dismiss } from '@shared/components/terminals/banners'
import { HistoryFrame } from '@shared/components/terminals/history/HistoryFrame'
import { MonitorBar } from '@shared/components/terminals/MonitorBar'
import { start, type Tab } from '@shared/components/terminals/tabs'
import { useGo } from '@shared/nav'
import { useBackLayer } from '../../nav'
import { Button, IconBtn } from '../../ui'
import { swipeScroll } from './swipeScroll'

const FONT = 12

export function TerminalPane({ tab, shown, monitor = true, rail = false }:
  { tab: Tab; shown: boolean; monitor?: boolean; rail?: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const go = useGo()

  useEffect(() => {
    const box = host.current!
    if (shown || !tab.el.isConnected) box.append(tab.el)
    if (!tab.term.element) tab.term.open(tab.el)
    tab.term.options.fontSize = FONT
    start(tab)
    const fit = () => { if (box.offsetWidth > 0 && box.offsetHeight > 0 && tab.term.element) tab.fit.fit() }
    const watch = new ResizeObserver(() => requestAnimationFrame(fit))
    watch.observe(box)
    const stopSwipe = swipeScroll(box, () => tab.term.element)
    return () => { watch.disconnect(); stopSwipe(); if (tab.el.parentElement === box) tab.el.remove() }
  }, [tab, shown])

  const terminal = <div ref={host} className="min-h-0 flex-1 touch-none py-1 pl-1" onClick={() => tab.term.focus()} />

  return (
    <div className={`absolute inset-0 flex flex-col bg-view ${shown ? '' : 'invisible'}`}>
      {tab.banners.map((b) => (
        <div key={b.id} className="flex min-h-11 shrink-0 items-center gap-2 border-b border-line bg-accent/15 py-1 pr-1
          pl-4">
          <span className="min-w-0 flex-1 text-sm break-words">{b.text}</span>
          {b.button && <Button small kind="primary" className="shrink-0"
            onClick={b.cluster ? () => go('clusters', { cluster: b.cluster! }) : b.action}>{b.button}</Button>}
          <IconBtn icon={X} label="Dismiss" small iconSize={14} onClick={() => dismiss(tab, b.id)} />
        </div>
      ))}
      {rail ? <HistoryFrame tab={tab} shown={shown} phone useBack={useBackLayer}>{terminal}</HistoryFrame> : terminal}
      {monitor && tab.session && tab.cluster && <div className="phone-monitor">
        <MonitorBar cluster={tab.cluster} node={tab.node} shown={shown} /></div>}
    </div>
  )
}
