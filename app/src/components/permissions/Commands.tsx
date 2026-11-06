import { useState } from 'react'

import type { CommandGroup } from '../../types/permissions'
import { Row } from '../e/Row'
import { Section } from '../e/Section'
import { CommandsDialog } from './CommandsDialog'
import { GROUPS } from './groups'

const count = (on: number, all: number) => all ? `${on} of ${all} allowed` : 'None yet'
const OWN = 'Your own'

export function Commands({ groups, custom, allowed, onChange, onAdd }: {
  groups: CommandGroup[]; custom: string[]; allowed: Set<string>; onChange: (cmds: string[], on: boolean) => void
  onAdd: (cmd: string) => void
}) {
  const [open, setOpen] = useState<CommandGroup | null>(null)
  const known = (c: string) => groups.some((g) => g.commands.includes(c)) || custom.includes(c)
  return (
    <Section title="Run without asking" note="Anything not allowed here asks you first.">
      {groups.map((g) => (
        <Row key={g.title} label={GROUPS[g.title] ?? g.title} opens onPress={() => setOpen(g)}
          sub={count(g.commands.filter((c) => allowed.has(c)).length, g.commands.length)} />
      ))}
      <Row label={OWN} opens onPress={() => setOpen({ title: OWN, note: '', commands: custom })}
        sub={count(custom.filter((c) => allowed.has(c)).length, custom.length)} />
      {open && <CommandsDialog group={open} own={open.title === OWN} allowed={allowed} known={known}
        commands={open.title === OWN ? custom : open.commands} onChange={onChange} onAdd={onAdd}
        onClose={() => setOpen(null)} />}
    </Section>
  )
}
