// The open terminals along the top, as on the desktop. ⋮ has what a right click does there (copy, paste), the links on
// the screen, the way back to the session list, and Rename and Stop for a session.
import { ClipboardPaste, Copy, Link, List as ListIcon, MoreVertical, TextSelect, X } from 'lucide-react'
import { useState } from 'react'

import { openLink } from '@shared/components/app/openLink'
import { SessionIcon } from '@shared/components/terminals/SessionIcon'
import { select } from '@shared/components/terminals/tabStore'
import { close, type Tab } from '@shared/components/terminals/tabs'
import { copyText, paste } from '@shared/components/terminals/xterm'
import { Dialog, IconBtn, Menu, Row, useToast, type MenuItem } from '../../ui'
import { screenLinks } from '../screenLinks'
import { SelectSheet } from './SelectSheet'
import { useSessionMenu } from './sessionMenu'

export function TabBar({ tabs, current, onChanged }: { tabs: Tab[]; current: string | null; onChanged: () => void }) {
  const toast = useToast()
  const tab = tabs.find((t) => t.key === current)
  // closing a session's tab only hides it: say so, so nobody thinks the work was stopped
  const shut = (t: Tab) => {
    close(t.key)
    if (t.session && !t.ended) toast(`${t.title} is still running. Reopen it from Sessions.`)
  }
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line pr-1">
      <div className="flex h-full min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]">
        {tabs.map((t) => (
          <div key={t.key} onClick={() => select(t.key)} className={`flex h-full max-w-[150px] min-w-[120px] shrink-0
            items-center gap-2 border-b-2 pr-0.5 pl-3 ${t.key === current ? 'border-accent font-semibold'
            : 'border-transparent text-dim active:bg-pressed'}`}>
            <SessionIcon session={t.session} />
            <span className={`min-w-0 flex-1 truncate ${t.ended ? 'text-dim' : ''}`}>{t.title}</span>
            <button aria-label="Close" onClick={(e) => { e.stopPropagation(); shut(t) }}
              className="grid size-6 shrink-0 place-items-center rounded text-dim active:bg-pressed"><X size={14} /></button>
          </div>
        ))}
      </div>
      {tab && <TabMenu key={tab.key} tab={tab} onChanged={onChanged} />}
    </div>
  )
}

function TabMenu({ tab, onChanged }: { tab: Tab; onChanged: () => void }) {
  const toast = useToast()
  const [sheet, setSheet] = useState<'' | 'select' | 'links'>('')
  const [links, setLinks] = useState<string[]>([])
  const { items, dialog } = useSessionMenu({ cluster: tab.cluster, name: tab.session, kind: tab.kind, node: tab.node,
    title: tab.title }, onChanged)
  const groups: MenuItem[][] = [
    [{ label: 'Copy text', icon: TextSelect, onClick: () => setSheet('select') },
      { label: 'Paste', icon: ClipboardPaste, onClick: () => { paste(tab, toast); tab.term.focus() } },
      { label: 'Links on the screen', icon: Link, onClick: () => { setLinks(screenLinks(tab)); setSheet('links') } }],
    [{ label: 'Sessions', icon: ListIcon, onClick: () => select(null) }],
    ...(tab.session ? [items] : []),
  ]
  return (
    <>
      <Menu label="More" groups={groups} trigger={<MoreVertical size={18} />}
        className="grid size-9 shrink-0 place-items-center rounded-md text-dim active:bg-pressed" />
      {sheet === 'select' && <SelectSheet tab={tab} onClose={() => setSheet('')} />}
      {sheet === 'links' && (
        <Dialog title="Links on the screen" onClose={() => setSheet('')}>
          {!links.length && <p className="px-5 pb-4 text-dim">No links on the screen.</p>}
          {links.length > 0 && <div className="border-t border-line">
            {links.map((url) => (
              <Row key={url} label={<span className="underline decoration-line-strong underline-offset-2 [overflow-wrap:anywhere]">{url}</span>}
                onPress={() => { openLink(url).catch((e) => toast(`Could not open it: ${e}`)); setSheet('') }}>
                <span onClick={(e) => e.stopPropagation()}>
                  <IconBtn icon={Copy} label="Copy" small
                    onClick={() => void copyText(url).then((ok) => toast(ok ? 'Copied' : 'Could not copy'))} />
                </span>
              </Row>
            ))}
          </div>}
        </Dialog>
      )}
      {dialog}
    </>
  )
}
