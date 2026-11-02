// What you can do with selected code: copy it, ask an agent about it, have it explained, or copy where it is
// ("train.py:40-58") to paste into a chat.
import { Copy, Link2, MessageCircleQuestion, MessageSquare } from 'lucide-react'

import type { Selection } from '@shared/components/code/Editor'

type Props = { selection: Selection; onCopy: () => void; onAsk: () => void; onExplain: () => void; onReference: () => void }

const BTN = 'flex h-12 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[10px] text-sm font-semibold active:bg-pressed'

export function SelectionBar({ selection, onCopy, onAsk, onExplain, onReference }: Props) {
  const lines = selection.toLine - selection.fromLine + 1
  return (
    <div className="flex shrink-0 flex-col border-t border-line bg-window px-2 pt-1 pb-1">
      <p className="px-2 text-xs text-dim">{lines === 1 ? `Line ${selection.fromLine}` : `Lines ${selection.fromLine} to ${selection.toLine}`}</p>
      <div className="flex gap-1" onPointerDown={(e) => e.preventDefault()}>
        <button className={BTN} onClick={onCopy}><Copy size={16} className="text-dim" />Copy</button>
        <button className={BTN} onClick={onAsk}><MessageSquare size={16} className="text-dim" />Ask</button>
        <button className={BTN} onClick={onExplain}><MessageCircleQuestion size={16} className="text-dim" />Explain</button>
        <button className={BTN} onClick={onReference} aria-label="Copy where this is, like train.py:40-58">
          <Link2 size={16} className="text-dim" />Where</button>
      </div>
    </div>
  )
}
