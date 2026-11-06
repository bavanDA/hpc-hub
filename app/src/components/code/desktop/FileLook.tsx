import { isDirty, type OpenFile } from '../store'
import type { Look } from './StatusLine'

const ITEM = 'shrink-0 whitespace-nowrap'
const DETAIL = `${ITEM} @max-[620px]:hidden`  // on a narrow editor the details hide first

export function FileLook({ file, look }: { file: OpenFile; look: Look }) {
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
