// The terminals open right now, as chips: tap one to switch to it. Shown above the session list, and as "N open"
// in a terminal's header so you can jump between them without going back.
import { Check } from 'lucide-react'

import { select, type Tab } from '@shared/components/terminals/tabs'
import { ListRow, Sheet } from '../../ui'

const dot = (t: Tab) => <span className="size-2.5 shrink-0 rounded-full"
  style={{ background: t.color || 'var(--color-dim)' }} />

export function OpenChips({ tabs, current }: { tabs: Tab[]; current: string | null }) {
  if (!tabs.length) return null
  return (
    <div className="mb-4">
      <h2 className="mb-2 text-sm font-bold text-dim">Open now</h2>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => select(t.key)} aria-current={t.key === current}
            className="flex h-11 max-w-[60vw] shrink-0 items-center gap-2 rounded-full bg-pill px-4 text-sm font-semibold
              active:bg-selected">
            {dot(t)}<span className="truncate">{t.title}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function OpenSwitcher({ tabs, current, onClose }: { tabs: Tab[]; current: string | null; onClose: () => void }) {
  return (
    <Sheet title="Open terminals" onClose={onClose}>
      {tabs.map((t) => (
        <ListRow key={t.key} title={<span className="flex items-center gap-2">{dot(t)}{t.title}</span>}
          subtitle={t.node ? `node ${t.node}` : t.cluster}
          trailing={t.key === current ? <Check size={20} className="text-accent-text" /> : <span className="w-5" />}
          onClick={() => { onClose(); select(t.key) }} />
      ))}
    </Sheet>
  )
}
