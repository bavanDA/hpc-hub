// On the session list, the open terminals that aren't sessions (a command's output) get their own rows.
import { SquareTerminal } from 'lucide-react'

import { select } from '@shared/components/terminals/tabStore'
import type { Tab } from '@shared/components/terminals/tabs'
import { Row, Section } from '../../ui'

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
