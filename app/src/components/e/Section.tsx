import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { List } from './List'

export function Section({ title, icon: Icon, note, children }:
  { title?: string; icon?: LucideIcon; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="pt-5">
      {title && <h3 className="flex items-center gap-2 px-5 pb-1.5 text-xs font-semibold tracking-wide text-dim
        uppercase">{Icon && <Icon size={14} className="shrink-0" />}{title}</h3>}
      <List>{children}</List>
      {note && <p className="px-5 pt-2 text-sm text-dim">{note}</p>}
    </section>
  )
}
