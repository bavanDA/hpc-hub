import { Copy } from 'lucide-react'
import type { ReactNode } from 'react'

import type { HCommit } from '../../../../types/history'
import { useToast } from '../../../toast'
import { fullDate, plural, when } from '../format'
import { Avatar } from '../ui/Avatar'
import { AskButton } from './AskButton'

export function CommitHead({ commit, switcher, onAsk }: { commit: HCommit; switcher: ReactNode; onAsk: () => void }) {
  const toast = useToast()
  const lines = commit.added + commit.removed
  return (
    <div className="shrink-0 border-b border-line px-6 pt-4 pb-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold select-text">{commit.subject}</h2>
          {commit.body && <p className="mt-1 max-w-[760px] whitespace-pre-line text-dim select-text">{commit.body}</p>}
        </div>
        <AskButton onClick={onAsk} label="Ask about this commit" />
        {switcher}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm text-dim">
        <Avatar name={commit.author} size={20} />
        <b className="text-text">{commit.author}</b> committed {Date.now() / 1000 - commit.time < 2 * 86400
          ? `${when(commit.time)}, ${fullDate(commit.time)}` : fullDate(commit.time)}
        <button onClick={() => navigator.clipboard.writeText(commit.hash).then(() => toast('Commit id copied'))
          .catch(() => toast('Could not copy'))} title="Copy the commit id"
          className="flex items-center gap-1 rounded bg-pill px-1.5 font-mono text-xs hover:bg-pressed">
          {commit.short} <Copy size={11} /></button>
        <span>{plural(commit.files.length, 'file')}, {plural(lines, 'line')} changed</span>
        {commit.tags.map((t) => <span key={t} className="rounded border border-line-strong px-1.5 text-xs">{t}</span>)}
      </div>
    </div>
  )
}
