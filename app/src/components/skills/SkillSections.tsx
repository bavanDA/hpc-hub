import { Plus, Sparkles, Trash2 } from 'lucide-react'

import type { CatalogSkill, Skill, SkillList } from '../../types/skills'
import { EButton, IconBtn, ItemRow } from '../e/extra'
import { Row, Section } from '../e/ui'
import { Spinner } from '../ui'

export function SkillSections({ list, adding, label, onAdd, onRemove }: {
  list: SkillList; adding: string; label: (target: string) => string
  onAdd: (k: CatalogSkill) => void; onRemove: (k: Skill) => void
}) {
  return (
    <>
      <Section title="HPC Hub skills">
        {list.catalog.map((k) => (
          <ItemRow key={k.folder} icon={Sparkles} label={<span className="font-medium">{k.name}</span>}
            sub={<>{k.on.length > 0 && <span className="text-text">In {k.on.map(label).join(', ')} · </span>}
              {k.description}</>}
            trailing={adding === k.folder ? <span className="grid size-9 place-items-center"><Spinner /></span>
              : <EButton small icon={Plus} onClick={() => onAdd(k)}>Add</EButton>} />
        ))}
      </Section>
      {list.targets.map((t) => {
        const mine = list.installed.filter((k) => k.target === t.id && !k.managed)
        const builtIn = list.installed.filter((k) => k.target === t.id && k.managed)
        return (
          <Section key={t.id} title={t.label}
            note={builtIn.length > 0 && `Comes with ${t.label}: ${builtIn.map((k) => k.name).join(', ')}`}>
            {mine.map((k) => (
              <ItemRow key={k.path} title={k.path} label={k.name} sub={k.description || k.path}
                trailing={<IconBtn icon={Trash2} label={`Remove ${k.name}`} onClick={() => onRemove(k)} />} />
            ))}
            {!mine.length && <Row label={<span className="text-dim">None added yet</span>} />}
          </Section>
        )
      })}
    </>
  )
}
