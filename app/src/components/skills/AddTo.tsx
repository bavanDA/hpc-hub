import { useState } from 'react'

import type { CatalogSkill, Target } from '../../types/skills'
import { EDialog, MainButton, Section, ToggleRow } from '../e/ui'

export function AddToDialog({ skill, targets, onClose, onAdd }:
  { skill: CatalogSkill; targets: Target[]; onClose: () => void; onAdd: (targets: string[]) => void }) {
  const [picked, setPicked] = useState(() => targets.map((t) => t.id).filter((t) => !skill.on.includes(t)))
  return (
    <EDialog title={`Add ${skill.name}`} width={460} onClose={onClose}
      actions={<MainButton disabled={!picked.length} onClick={() => { onClose(); onAdd(picked) }}>Add</MainButton>}>
      <p className="px-5 text-dim">{skill.description}</p>
      <Section title="Add it to">
        {targets.map((t) => (
          <ToggleRow key={t.id} label={t.label} sub={skill.on.includes(t.id) ? 'Has it already' : t.folder}
            checked={picked.includes(t.id)}
            onChange={(on) => setPicked(on ? [...picked, t.id] : picked.filter((x) => x !== t.id))} />
        ))}
      </Section>
    </EDialog>
  )
}
