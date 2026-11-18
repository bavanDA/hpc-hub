// The chat's name at the top of a Claude tab, and the menu behind it: Claude tabs open on this cluster, its earlier
// chats (resumed when picked), and a new chat in the same folder.
import { ChevronDown, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { call } from '../../rpc'
import type { Chat, Chats, Started } from '../../types/tools'
import { openTmux, type Tab } from '../terminals/tabs'
import { select } from '../terminals/tabStore'
import { useTabs } from '../terminals/useTabs'
import { useToast } from '../useToast'
import { isClaudeTab, tagOf } from './tabs'

const ago = (t: number) => {
  const s = Date.now() / 1000 - t
  return s < 3600 ? `${Math.max(1, Math.round(s / 60))} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago`
    : new Date(t * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function ChatSwitcher({ tab, cwd }: { tab: Tab; cwd: string }) {
  const toast = useToast()
  const { tabs } = useTabs()
  const [open, setOpen] = useState(false)
  const [chats, setChats] = useState<Chat[] | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const running = tabs.filter((t) => t.cluster === tab.cluster && isClaudeTab(t))
  const openTags = new Set(running.map((t) => tagOf(t.session)))

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', away)
    if (chats === null) {
      call<Chats>('tools.chats', { cluster: tab.cluster, agent: 'claude' })
        .then((c) => setChats(c.chats)).catch(() => setChats([]))
    }
    return () => window.removeEventListener('mousedown', away)
  }, [open, chats, tab.cluster])

  const start = (params: Record<string, string>) => {
    setOpen(false)
    toast('Starting Claude…')
    call<Started>('tools.agent_start', { cluster: tab.cluster, agent: 'claude', ...params })
      .then((c) => openTmux(tab.cluster, c))
      .catch((e: Error) => toast(e.message, { kind: 'error' }))
  }
  const resume = (c: Chat) => {
    const already = running.find((t) => tagOf(t.session) === c.id.slice(0, 8))
    if (already) { setOpen(false); select(already.key); return }
    start({ folder: c.cwd || '~', chat_id: c.id, label: c.name.slice(0, 40) })
  }
  const name = tab.title.replace(/^Claude · /, '')
  const earlier = (chats ?? []).filter((c) => !openTags.has(c.id.slice(0, 8))).slice(0, 8)

  return (
    <div ref={box} className="relative min-w-0">
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu"
        className="flex h-8 max-w-full items-center gap-2 rounded-lg border border-transparent px-2 hover:border-line-strong hover:bg-hover">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: tab.color || 'var(--color-orange)' }} />
        <b className="truncate font-semibold">{name}</b>
        <span className="truncate text-sm text-dim">{[tab.node, cwd].filter(Boolean).join(' · ')}</span>
        <ChevronDown size={13} className="shrink-0" />
      </button>
      {open && (
        <div role="menu" aria-label="Chats"
          className="menu-in absolute top-9 left-0 z-30 w-[400px] rounded-xl bg-raised p-1.5 shadow-[var(--shadow-menu)]">
          <div className="px-2.5 pt-1.5 pb-1 text-xs font-semibold text-dim">Open</div>
          {running.map((t) => (
            <button key={t.key} role="menuitem" onClick={() => { setOpen(false); select(t.key) }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-hover ${t.key === tab.key ? 'bg-hover' : ''}`}>
              <span className="size-2 shrink-0 rounded-full" style={{ background: t.color || 'var(--color-orange)' }} />
              <span className="min-w-0 flex-1 truncate font-semibold">{t.title.replace(/^Claude · /, '')}</span>
              <span className="text-xs text-dim">{t.ended ? 'ended' : t.node || 'login node'}</span>
            </button>
          ))}
          <div className="px-2.5 pt-2.5 pb-1 text-xs font-semibold text-dim">Earlier</div>
          {chats === null && <div className="px-2.5 py-2 text-sm text-dim">Reading your chats…</div>}
          {chats !== null && !earlier.length && <div className="px-2.5 py-2 text-sm text-dim">No other chats</div>}
          {earlier.map((c) => (
            <button key={c.id} role="menuitem" onClick={() => resume(c)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-hover">
              <span className="min-w-0 flex-1"><b className="block truncate font-semibold">{c.name}</b>
                <span className="block truncate text-xs text-dim">{ago(c.mtime)} · {c.cwd}</span></span>
              <span className="rounded-full bg-pill px-2 text-[11px] text-dim">resume</span>
            </button>
          ))}
          <div className="mt-1 flex items-center justify-between border-t border-line px-1.5 pt-2 pb-0.5">
            <button onClick={() => start({ folder: cwd || '~' })}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-semibold text-on-accent">
              <Plus size={14} />New chat here</button>
            <span className="text-xs text-dim">All chats are in Agents</span>
          </div>
        </div>
      )}
    </div>
  )
}
