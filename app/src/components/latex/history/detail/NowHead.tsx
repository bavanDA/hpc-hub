import { ArrowUp, Check, Pencil } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { Button, Spinner } from '../../../ui'
import { shortHash, when } from '../format'
import { DraftCard } from '../write/DraftCard'
import { WriteButton } from '../write/WriteButton'
import type { DetailProps } from './Detail'

export function NowHead({ state, switcher, onCommit, onCommitSplit, assist, saved, commits }:
  DetailProps & { switcher: ReactNode }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<'' | 'commit' | 'push'>('')
  const go = async (push: boolean) => {
    if (!message.trim() || busy) return
    setBusy(push ? 'push' : 'commit')
    if (await onCommit(message.trim(), push)) setMessage('')
    setBusy('')
  }
  const none = !state.changes.length
  const draft = assist.draft?.result.head === state.head ? assist.draft : null  // written for an older commit: gone
  return (
    <div className="shrink-0 border-b border-line px-6 pt-4 pb-3">
      <div className="flex items-center gap-3">
        <span className="grid size-7 place-items-center rounded-full border border-dashed border-line-strong text-dim">
          <Pencil size={13} /></span>
        <h2 className="min-w-0 flex-1 text-xl font-semibold">Not committed yet</h2>
        {switcher}
      </div>
      <p className="mt-1 text-dim">{none ? 'Nothing changed since your last commit.' : <>Your changes since <code
        className="rounded bg-pill px-1.5 font-mono text-sm">{shortHash(state.head)}</code>{state.saved_at
        ? `, saved ${when(state.saved_at)}` : ''}. Co-authors see them after you commit and push.</>}</p>
      {!none && draft && <DraftCard key={draft.n} assist={assist} draft={draft} state={state} saved={saved}
        headTime={commits.find((c) => c.hash === state.head)?.time ?? 0} onCommit={onCommit} onCommitSplit={onCommitSplit} />}
      {!none && !draft && (
        <div className="mt-3 flex flex-wrap items-start gap-2">
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Say what changed and why"
            aria-label="Commit message" rows={Math.min(5, Math.max(1, message.split('\n').length))}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void go(false) }}
            className="min-h-9 max-w-[360px] min-w-[240px] flex-1 resize-none rounded-lg bg-pill px-3 py-2 text-base leading-5 outline-none
              placeholder:text-faint focus:ring-2 focus:ring-focus" />
          <WriteButton assist={assist} />
          <Button kind="primary" disabled={!message.trim() || !!busy} onClick={() => void go(false)}>
            {busy === 'commit' ? <Spinner size={14} /> : <Check size={15} />} Commit</Button>
          <Button disabled={!message.trim() || !!busy || !state.remotes.length} onClick={() => void go(true)}
            title={state.remotes.length ? 'Commit, then pull first and push' : 'This paper has no remote'}>
            {busy === 'push' ? <Spinner size={14} /> : <ArrowUp size={15} />} Commit and push</Button>
        </div>
      )}
      {!none && !draft && <p className="mt-1.5 text-xs text-dim">The first line is the summary; a blank line, then the why.
        Ctrl+Enter commits.</p>}
    </div>
  )
}
