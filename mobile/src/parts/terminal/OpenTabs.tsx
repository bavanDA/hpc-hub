// The terminals open right now. In a terminal's header "N open" lists them so you can jump between them without
// going back; on the session list, the open ones that aren't sessions (a command's output) get their own rows.
import { Check, SquareTerminal } from 'lucide-react'

import { select } from '@shared/components/terminals/tabStore'
import type { Tab } from '@shared/components/terminals/tabs'
import { List, Row, Section, Sheet } from '../../ui'

/** Open tabs that are no tmux session, so the session list doesn't show them. */
export function OpenOthers({ tabs }: { tabs: Tab[] }) {
  const others = tabs.filter((t) => !t.session)
  if (!others.length) return null
  return (
    <Section title="Open">
      {others.map((t) => <Row key={t.key} icon={SquareTerminal} label={t.title} onPress={() => select(t.key)} />)}
    </Section>
  )
}

export function OpenSwitcher({ tabs, current, onClose }: { tabs: Tab[]; current: string | null; onClose: () => void }) {
  return (
    <Sheet title="Open terminals" flush onClose={onClose}>
      <List>
        {tabs.map((t) => (
          <Row key={t.key} label={t.title} sub={t.node || t.cluster} onPress={() => { onClose(); select(t.key) }}>
            {t.key === current ? <Check size={20} aria-label="Shown now" className="shrink-0" /> : <span className="w-5" />}
          </Row>
        ))}
      </List>
    </Sheet>
  )
}
