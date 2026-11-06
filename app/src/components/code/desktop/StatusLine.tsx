import type { ReactNode } from 'react'

import type { OpenFile } from '../store'
import { FileLook } from './FileLook'
import { FolderPath } from './FolderPath'

export type Look = { lang: string; indent: string; line: number; col: number; selected: number }

/** The line under the editor: the terminal button and the folder on the left, the file's details on the right. */
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
