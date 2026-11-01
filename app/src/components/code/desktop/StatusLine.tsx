// The line under the editor, like VS Code's: where the file is, where the cursor is, how it's written, saved or not.
// One line always: on a narrow editor (the Ask panel open) the path shortens and the details hide first.
import { isDirty, type OpenFile } from '../store'

export type Look = { lang: string; indent: string; line: number; col: number; selected: number }

const ITEM = 'shrink-0 whitespace-nowrap'
const DETAIL = `${ITEM} @max-[620px]:hidden`

export function StatusLine({ file, clusterName, look }: { file: OpenFile; clusterName: string; look: Look }) {
  const dirty = isDirty(file)
  const state = file.loading ? 'Opening' : !file.writable ? (file.readonlyReason || 'Read-only')
    : dirty ? 'Not saved' : 'Saved'
  return (
    <div className="@container shrink-0 border-t border-line bg-window">
      <div className="flex h-7 items-center gap-4 overflow-hidden px-3 text-xs text-dim">
        <span className="min-w-0 flex-1 truncate" title={file.path}>
          {clusterName} · <span className="font-mono">{file.path}</span></span>
        {look.selected > 0 && <span className={DETAIL}>{look.selected} selected</span>}
        <span className={`${ITEM} tnum`}>Line {look.line}, column {look.col}</span>
        <span className={DETAIL}>{look.indent}</span>
        <span className={DETAIL}>{file.eol === 'crlf' ? 'CRLF' : 'LF'}</span>
        <span className={DETAIL}>{file.lossy ? 'Not UTF-8' : 'UTF-8'}</span>
        {look.lang && <span className={`${ITEM} @max-[460px]:hidden`}>{look.lang}</span>}
        <span className={`${ITEM} ${dirty ? 'font-semibold text-text' : file.writable ? 'text-ok' : ''}`}>{state}</span>
      </div>
    </div>
  )
}
