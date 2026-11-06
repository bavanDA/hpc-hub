import { useEffect, useState } from 'react'

import { call } from '../../../rpc'
import { Dialog, Spinner } from '../../ui'
import type { Where } from './where'

const lineClass = (l: string) => l.startsWith('+') && !l.startsWith('+++') ? 'bg-ok-bg text-ok'
  : l.startsWith('-') && !l.startsWith('---') ? 'bg-bad-bg text-bad'
  : l.startsWith('@@') ? 'text-accent-text' : ''

export function CommitDialog({ where, commit, onClose }:
  { where: Where; commit: { hash: string; subject: string }; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    call<string>('latex.git_show', { ...where, commit: commit.hash }).then(setText)
      .catch((e: Error) => setText(e.message))
  }, [where, commit.hash])
  return (
    <Dialog title={`${commit.hash} · ${commit.subject}`} onClose={onClose} width={860}>
      {text === null ? <div className="grid h-60 place-items-center"><Spinner size={24} /></div>
        : <pre className="max-h-[70vh] overflow-auto rounded-lg bg-view p-3 font-mono text-xs leading-[18px]
            select-text">{text.split('\n').map((l, i) => (
            <div key={i} className={lineClass(l)}>{l || ' '}</div>))}</pre>}
    </Dialog>
  )
}
