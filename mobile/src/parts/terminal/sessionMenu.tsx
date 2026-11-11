// What ⋮ offers for a session, on its row and on its tab: the desktop's Rename and Stop, the same calls and words, in
// windows that close with Android's Back. Returns the menu's items and the window to render.
import { useState, type ReactNode } from 'react'

import { RenameDialog } from '@shared/components/terminals/RenameDialog'
import { tabKey } from '@shared/components/terminals/tabKey'
import { getTab } from '@shared/components/terminals/tabStore'
import { close, update } from '@shared/components/terminals/tabs'
import { call } from '@shared/rpc'
import { BackLayer, ConfirmDialog, useToast, type MenuItem } from '../../ui'

export type Target = { cluster: string; name: string; kind: 'tmux' | 'screen'; node: string; title: string }

export function useSessionMenu(target: Target, onChanged: () => void): { items: MenuItem[]; dialog: ReactNode } {
  const toast = useToast()
  const [open, setOpen] = useState<'rename' | 'stop' | null>(null)
  const params = { cluster: target.cluster, session: target.name, node: target.node }
  const key = tabKey(target.cluster, target.name)
  const shut = () => setOpen(null)

  const run = (method: string, extra: Record<string, unknown>, after: () => void = () => {}) => {
    call(method, { ...params, ...extra })
      .then(after)
      .catch((e: Error) => toast(`Failed: ${e.message}`))
      .finally(onChanged)
  }

  const items: MenuItem[] = [
    { label: 'Rename…', onClick: () => setOpen('rename') },
    { label: 'Stop session…', danger: true, onClick: () => setOpen('stop') },
  ]
  const dialog = open === 'rename'
    ? <BackLayer onBack={shut}><RenameDialog target={target} onClose={shut}
        onRename={(label) => run('terminals.rename', { label, kind: target.kind }, () => update(key, { title: label }))} /></BackLayer>
    : open === 'stop'
      ? <ConfirmDialog title={`Stop ${target.title}?`} keep="Keep it running" confirm="Stop session" danger
          text="Everything running in it stops." onClose={shut}
          onConfirm={() => { if (getTab(key)) close(key); run('terminals.stop', { kind: target.kind }) }} />
      : null
  return { items, dialog }
}
