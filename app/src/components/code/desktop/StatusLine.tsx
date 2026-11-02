// The line under the editor, like VS Code's: the terminal button on the left; where the cursor is, how it's written,
// saved or not on the right. The path bar above already says where the file is. One line always: on a narrow editor
// (the Ask panel open) the details hide first.
import type { ReactNode } from 'react'

import { isDirty, type OpenFile } from '../store'

export type Look = { lang: string; indent: string; line: number; col: number; selected: number }

const ITEM = 'shrink-0 whitespace-nowrap'
const DETAIL = `${ITEM} @max-[620px]:hidden`

export function StatusLine({ file, look, left }: { file: OpenFile | null; look: Look; left?: ReactNode }) {
  return (
    <div className="@container shrink-0 border-t border-line bg-window">
      <div className="flex h-7 items-center gap-4 overflow-hidden px-3 text-xs text-dim">
        {left}
        <span className="flex-1" />
        {file && !file.loading && <FileLook file={file} look={look} />}
      </div>
    </div>
  )
}

function FileLook({ file, look }: { file: OpenFile; look: Look }) {
  const dirty = isDirty(file)
  const state = file.error ? '' : !file.writable ? (file.readonlyReason || 'Read-only') : dirty ? 'Not saved' : 'Saved'
  return (
    <>
      {look.selected > 0 && <span className={DETAIL}>{look.selected} selected</span>}
      <span className={`${ITEM} tnum`}>Line {look.line}, column {look.col}</span>
      <span className={DETAIL}>{look.indent}</span>
      <span className={DETAIL}>{file.eol === 'crlf' ? 'CRLF' : 'LF'}</span>
      <span className={DETAIL}>{file.lossy ? 'Not UTF-8' : 'UTF-8'}</span>
      {look.lang && <span className={`${ITEM} @max-[460px]:hidden`}>{look.lang}</span>}
      <span className={`${ITEM} ${dirty ? 'font-semibold text-text' : ''}`}>{state}</span>
    </>
  )
}
