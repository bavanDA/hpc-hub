// The line under the editor, like VS Code's: the terminal button and the open folder's full path (click copies it)
// on the left; where the cursor is, how it's written, saved or not on the right. One line always: on a narrow editor
// (the Ask panel open) the details hide first, and a long path is shortened at its start.
import { useState, type ReactNode } from 'react'

import { copyText } from '../../terminals/xterm'

import { isDirty, type OpenFile } from '../store'

export type Look = { lang: string; indent: string; line: number; col: number; selected: number }

const ITEM = 'shrink-0 whitespace-nowrap'
const DETAIL = `${ITEM} @max-[620px]:hidden`

export function StatusLine({ file, look, left, folder }:
  { file: OpenFile | null; look: Look; left?: ReactNode; folder?: string }) {
  return (
    <div className="@container shrink-0 border-t border-line bg-window">
      <div className="flex h-7 items-center gap-4 overflow-hidden px-3 text-xs text-dim">
        {left}
        {folder ? <FolderPath path={folder} /> : <span className="flex-1" />}
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

/** The folder's full path; a click copies it. Shortened at the start when long, all of it on hover. */
function FolderPath({ path }: { path: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button type="button" title={`${path}\nClick to copy`} onClick={() => copyText(path).then((ok) => {
      setCopied(ok)
      setTimeout(() => setCopied(false), 1500)
    })} className="min-w-0 flex-1 truncate text-left font-mono hover:text-text [direction:rtl]">
      <bdi>{copied ? 'Copied' : path}</bdi>
    </button>
  )
}
