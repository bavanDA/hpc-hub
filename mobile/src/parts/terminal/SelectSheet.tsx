// Copying from a terminal on a phone: the screen's text as plain text you can select with your finger, Copy screen
// for all of it, and Copy tmux buffer for what you selected inside tmux (mouse mode keeps that selection there).
import { ClipboardCopy, Copy } from 'lucide-react'
import { useMemo } from 'react'

import type { Tab } from '@shared/components/terminals/tabs'
import { copyText } from '@shared/components/terminals/xterm'
import { call } from '@shared/rpc'
import { Button, Sheet, useToast } from '../../ui'

/** The lines on screen now, trailing spaces trimmed and blank lines at the end dropped. */
export function screenText(tab: Tab): string {
  const b = tab.term.buffer.active
  const lines: string[] = []
  for (let y = b.viewportY; y < b.viewportY + tab.term.rows; y++) {
    lines.push(b.getLine(y)?.translateToString(true) ?? '')
  }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  return lines.join('\n')
}

export function SelectSheet({ tab, onClose }: { tab: Tab; onClose: () => void }) {
  const toast = useToast()
  const text = useMemo(() => screenText(tab), [tab])
  const copy = (t: string) => copyText(t).then((ok) => toast(ok ? 'Copied' : 'Could not copy'))
  const buffer = () => call<string>('terminals.buffer', { cluster: tab.cluster, node: tab.node })
    .then((t) => t ? copy(t) : toast('The tmux buffer is empty. Select text in tmux first.'))
    .catch((e: Error) => toast(`Could not read the tmux buffer: ${e.message}`))
  return (
    <Sheet title="Copy text" onClose={onClose} actions={<>
      {tab.session && <Button icon={ClipboardCopy} className="flex-1" onClick={buffer}>Copy tmux buffer</Button>}
      <Button kind="primary" icon={Copy} className="flex-1" onClick={() => copy(text).then(onClose)}>Copy screen</Button>
    </>}>
      <p className="mb-3 text-sm text-dim">Press and hold to select part of it, or copy the whole screen.</p>
      <pre className="overflow-x-auto rounded-lg bg-soft p-3 font-mono text-xs leading-relaxed whitespace-pre
        select-text">{text || 'The screen is empty.'}</pre>
    </Sheet>
  )
}
