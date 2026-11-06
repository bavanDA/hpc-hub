// A screen that isn't built yet: its title and one line on what it will do.
import type { LucideIcon } from 'lucide-react'

import { EmptyState } from '@shared/components/ui/EmptyState'
import { Header } from './Header'

export function Placeholder({ title, icon, text }: { title: string; icon: LucideIcon; text: string }) {
  return (
    <div className="flex h-full flex-col">
      <Header title={title} />
      <div className="min-h-0 flex-1"><EmptyState icon={icon} title="Coming soon" text={text} /></div>
    </div>
  )
}
