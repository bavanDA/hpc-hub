// Skill rows: a name with up to two lines of description, and the built-in ones folded away.
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import type { Skill } from '../../types/skills'

export function SkillRow({ name, description, path, suffix }:
  { name: string; description: ReactNode; path?: string; suffix?: ReactNode }) {
  return (
    <div title={path || undefined} className="flex min-h-[56px] items-center gap-3 px-4 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate">{name}</div>
        {description && <div className="line-clamp-2 text-[13px] text-dim">{description}</div>}
      </div>
      {suffix}
    </div>
  )
}

/** Synced or built in: managed by the agent itself, shown folded. */
export function BuiltIn({ label, skills }: { label: string; skills: Skill[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen(!open)}
        className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left hover:bg-hover">
        <div className="min-w-0 flex-1">
          <div>Built in or synced ({skills.length})</div>
          <div className="text-[13px] text-dim">Managed by {label} itself</div>
        </div>
        {open ? <ChevronDown size={16} className="text-dim" /> : <ChevronRight size={16} className="text-dim" />}
      </button>
      {open && (
        <div className="divide-y divide-line border-t border-line bg-view/40">
          {skills.map((k) => <SkillRow key={k.path} name={k.name} description={k.description} path={k.path} />)}
        </div>
      )}
    </div>
  )
}
