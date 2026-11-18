// The chat's name at the top of a Claude tab, with its node and folder. Switching chats is the tab bar's job.
import type { Tab } from '../terminals/tabs'

export function ChatTitle({ tab, cwd }: { tab: Tab; cwd: string }) {
  return (
    <div className="flex h-8 min-w-0 items-center gap-2 px-2">
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: tab.color || 'var(--color-orange)' }} />
      <b className="truncate font-semibold">{tab.title.replace(/^Claude · /, '')}</b>
      <span className="truncate text-sm text-dim">{[tab.node, cwd].filter(Boolean).join(' · ')}</span>
    </div>
  )
}
