// One terminal, full screen: xterm sized to fit (it shrinks when the keyboard opens), the monitoring bar, and a
// row of the keys a phone keyboard lacks. The header switches between open terminals, copies text, opens links.
import { ArrowLeft, ClipboardPaste, Copy, Link, MoreVertical, TextSelect, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import '@xterm/xterm/css/xterm.css'

import { openLink } from '@shared/components/app/openLink'
import { MonitorBar } from '@shared/components/terminals/MonitorBar'
import { close, start, useTabs, type Tab } from '@shared/components/terminals/tabs'
import { copyText, paste } from '@shared/components/terminals/xterm'
import { Button, List, Sheet, useToast } from '../ui'
import { screenLinks } from './screenLinks'
import { OpenSwitcher } from './terminal/OpenTabs'
import { SelectSheet } from './terminal/SelectSheet'
import { SessionActions } from './terminal/SessionActions'

const KEYS: [string, string][] = [['Esc', '\x1b'], ['Tab', '\t'], ['↑', '\x1b[A'], ['↓', '\x1b[B'], ['←', '\x1b[D'],
  ['→', '\x1b[C'], ['|', '|'], ['~', '~'], ['/', '/'], ['-', '-']]
const CTRL = ['C', 'D', 'Z', 'L', 'R', 'A', 'B', 'E', 'U', 'W']
const FONT = 12

const iconButton = 'grid size-12 shrink-0 place-items-center rounded-full active:bg-pressed'

export function TerminalScreen({ tab, shown, onBack, onChanged = () => {} }:
  { tab: Tab; shown: boolean; onBack: () => void; onChanged?: () => void }) {
  const toast = useToast()
  const { tabs, current } = useTabs()
  const host = useRef<HTMLDivElement>(null)
  const [ctrl, setCtrl] = useState(false)
  const [links, setLinks] = useState<string[] | null>(null)
  const [sheet, setSheet] = useState<'' | 'switch' | 'select' | 'actions'>('')

  useEffect(() => {
    const box = host.current!
    box.append(tab.el)
    if (!tab.term.element) tab.term.open(tab.el)
    tab.term.options.fontSize = FONT
    start(tab)
    const fit = () => { if (box.offsetWidth > 0 && box.offsetHeight > 0 && tab.term.element) tab.fit.fit() }
    const watch = new ResizeObserver(() => requestAnimationFrame(fit))
    watch.observe(box)
    return () => { watch.disconnect(); tab.el.remove() }
  }, [tab])

  // a key from the row: typed into the terminal, keyboard stays open
  const send = (data: string) => { tab.term.input(data, true); tab.term.focus() }
  const key = (label: string, onClick: () => void) => (
    <button key={label} onPointerDown={(e) => e.preventDefault()} onClick={onClick}
      className="h-12 min-w-12 shrink-0 rounded-lg border border-line-strong px-3 font-mono text-sm font-semibold
        active:bg-pressed">
      {label}</button>
  )

  return (
    <div className="flex h-full flex-col bg-view">
      <header className="flex min-h-14 shrink-0 items-center border-b border-line px-1">
        <button aria-label="Back" onClick={onBack} className={iconButton}><ArrowLeft size={22} /></button>
        <h1 className="line-clamp-2 min-w-0 flex-1 pl-1 leading-tight font-semibold break-words">{tab.title}</h1>
        {tabs.length > 1 && (
          <button onClick={() => setSheet('switch')} className="flex h-12 shrink-0 items-center px-1">
            <span className="flex h-8 items-center rounded-full border border-line-strong px-2.5 text-sm font-medium
              active:bg-pressed">{tabs.length} open</span></button>
        )}
        <button aria-label="Copy text" onClick={() => setSheet('select')} className={iconButton}>
          <TextSelect size={20} /></button>
        <button aria-label="Paste" onClick={() => paste(tab, toast)} className={iconButton}>
          <ClipboardPaste size={20} /></button>
        <button aria-label="Links" onClick={() => setLinks(screenLinks(tab))} className={iconButton}>
          <Link size={20} /></button>
        {tab.session
          ? <button aria-label="Session actions" onClick={() => setSheet('actions')} className={iconButton}>
              <MoreVertical size={20} /></button>
          : <button aria-label="Close" onClick={() => { close(tab.key); onBack() }} className={iconButton}>
              <X size={22} /></button>}
      </header>
      {tab.banners.map((b) => (
        <div key={b.id} className="flex shrink-0 items-center gap-3 border-b border-line bg-soft py-1 pr-2 pl-4 text-sm">
          <span className="min-w-0 flex-1 break-words">{b.text}</span>
          {b.button && <Button className="shrink-0 text-sm" onClick={b.action}>{b.button}</Button>}
        </div>
      ))}
      <div ref={host} className="min-h-0 flex-1 py-1 pl-1" onClick={() => tab.term.focus()} />
      {tab.session && <div className="phone-monitor"><MonitorBar cluster={tab.cluster} node={tab.node} shown={shown} /></div>}
      <div className="flex shrink-0 gap-1.5 overflow-x-auto border-t border-line bg-window p-1.5">
        {ctrl
          ? <>{key('Ctrl', () => setCtrl(false))}{CTRL.map((c) =>
              key(`^${c}`, () => { send(String.fromCharCode(c.charCodeAt(0) - 64)); setCtrl(false) }))}</>
          : <>{key('Ctrl', () => setCtrl(true))}{KEYS.map(([label, data]) => key(label, () => send(data)))}</>}
      </div>
      {sheet === 'switch' && <OpenSwitcher tabs={tabs} current={current} onClose={() => setSheet('')} />}
      {sheet === 'select' && <SelectSheet tab={tab} onClose={() => setSheet('')} />}
      {sheet === 'actions' && (
        <SessionActions target={{ cluster: tab.cluster, name: tab.session, kind: tab.kind, node: tab.node,
          title: tab.title }} onClose={() => setSheet('')} onChanged={onChanged}
          detach={() => { close(tab.key); onBack() }} />
      )}
      {links && (
        <Sheet title="Links on the screen" flush onClose={() => setLinks(null)}>
          {!links.length && <p className="px-4 py-6 text-center text-dim">No links on the screen.</p>}
          {links.length > 0 && (
            <List>
              {links.map((url) => (
                <div key={url} className="flex items-center border-b border-line pr-1">
                  <button onClick={() => { openLink(url).catch((e) => toast(`Could not open it: ${e}`)); setLinks(null) }}
                    className="min-h-14 min-w-0 flex-1 py-2 pl-4 text-left text-sm break-all underline
                      decoration-line-strong underline-offset-2 active:bg-pressed">{url}</button>
                  <button aria-label="Copy" onClick={() => copyText(url).then((ok) => toast(ok ? 'Copied' : 'Could not copy'))}
                    className={`${iconButton} text-dim`}><Copy size={20} /></button>
                </div>
              ))}
            </List>
          )}
        </Sheet>
      )}
    </div>
  )
}
