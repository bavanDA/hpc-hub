// The row of keys over the phone keyboard while you type in the Code tab: Tab, dedent, arrows, undo, redo, then the
// symbols the file's language needs most. A key never takes the focus from the editor, so the keyboard stays up.
import { ChevronDown } from 'lucide-react'
import type { RefObject } from 'react'

import type { EditorHandle } from '@shared/components/code/Editor'
import { keyRow } from '@shared/components/code/keys'
import type { LangId } from '@shared/components/code/languages'

export function KeyRow({ lang, editor }: { lang: LangId; editor: RefObject<EditorHandle | null> }) {
  const keep = (e: React.PointerEvent) => e.preventDefault()  // the editor keeps the focus
  return (
    <div className="flex h-12 shrink-0 items-stretch gap-1 overflow-x-auto border-t border-line bg-header px-1 py-1"
      role="toolbar" aria-label="Keys">
      {keyRow(lang).map((k) => (
        <button key={k.id} type="button" title={k.title} aria-label={k.title} onPointerDown={keep}
          onClick={() => { const v = editor.current?.view(); if (v) k.run(v) }}
          className="min-w-11 shrink-0 rounded-lg bg-pill px-2 font-mono text-base active:bg-selected">{k.label}</button>
      ))}
      <button type="button" aria-label="Hide the keyboard" onPointerDown={keep}
        onClick={() => editor.current?.view()?.contentDOM.blur()}
        className="grid min-w-11 shrink-0 place-items-center rounded-lg text-dim active:bg-hover">
        <ChevronDown size={20} />
      </button>
    </div>
  )
}
