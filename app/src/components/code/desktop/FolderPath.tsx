import { useState } from 'react'

import { copyText } from '../../terminals/xterm'

/** The folder's full path; a click copies it. Shortened at the start when long, all of it on hover. */
export function FolderPath({ path }: { path: string }) {
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
