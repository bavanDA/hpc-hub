// Git for a paper, full screen: branch and remote, Pull and Push, the changes with a commit message, and the
// history (tap a commit to see what it changed). before() saves the open file first.
import { ArrowDown, ArrowUp, Copy, GitCommitHorizontal } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { copyText } from '@shared/components/terminals/xterm'
import { Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { Commit, GitInfo } from '@shared/types/latex'
import { Button, Card, Field, ListRow, Sheet, useToast } from '../../ui'

type Where = { cluster: string; folder: string }
const lastLine = (s: string) => s.trim().split('\n').pop() ?? s

export function GitSheet({ where, before, onPulled, onClose }:
  { where: Where; before: () => Promise<boolean>; onPulled: () => void; onClose: () => void }) {
  const toast = useToast()
  const [info, setInfo] = useState<GitInfo | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const [shown, setShown] = useState<Commit | null>(null)
  const load = useCallback(() => {
    call<GitInfo>('latex.git_info', where).then((i) => { setInfo(i); setError('') })
      .catch((e: Error) => setError(e.message))
  }, [where])
  useEffect(load, [load])

  const run = async (what: 'commit' | 'pull' | 'push') => {
    if (busy || !(await before())) return
    setBusy(what)
    try {
      await call(`latex.git_${what}`, what === 'commit' ? { ...where, message } : where)
      toast(what === 'commit' ? 'Committed' : what === 'pull' ? 'Pulled' : 'Pushed')
      if (what === 'commit') setMessage('')
      if (what === 'pull') onPulled()
      load()
    } catch (e) {
      toast(`Git: ${lastLine((e as Error).message)}`)
    } finally { setBusy('') }
  }

  return (
    <Sheet title="Git" onClose={onClose}>
      {error ? <p className="py-8 text-center text-bad">{error}</p>
        : !info ? <div className="grid h-40 place-items-center"><Spinner size={28} /></div>
        : !info.root ? <p className="py-8 text-center text-dim">This folder is not a git repository.</p>
        : <>
          <Card className="py-1">
            <ListRow title="Branch" subtitle={info.branch || '(detached)'} />
            {info.remotes.length ? info.remotes.map((r) => (
              <ListRow key={r.name} title={`Remote ${r.name}`} subtitle={r.url}
                trailing={<button aria-label="Copy address" onClick={() => copyText(r.url)
                  .then((ok) => toast(ok ? 'Address copied' : "Couldn't copy"))}
                  className="-mr-2 grid size-11 place-items-center rounded-full text-dim active:bg-hover">
                  <Copy size={20} /></button>} />
            )) : <ListRow title="Remote" subtitle="None" />}
          </Card>
          <div className="mt-3 flex gap-2">
            <Button className="flex-1" disabled={!!busy} onClick={() => run('pull')}>
              {busy === 'pull' ? <Spinner size={18} /> : <ArrowDown size={20} />} Pull</Button>
            <Button className="flex-1" disabled={!!busy || !info.remotes.length} onClick={() => run('push')}>
              {busy === 'push' ? <Spinner size={18} /> : <ArrowUp size={20} />} Push</Button>
          </div>

          <h2 className="mt-6 mb-2 text-sm font-bold text-dim">
            {info.changes.length ? `${info.changes.length} changed ${info.changes.length === 1 ? 'file' : 'files'}`
              : 'Nothing to commit'}</h2>
          {info.changes.length > 0 && (
            <Card className="py-1">
              {info.changes.slice(0, 40).map((c) => (
                <div key={c.path} className="flex min-h-11 items-center gap-3">
                  <span className={`w-10 shrink-0 font-mono text-sm font-semibold ${c.status === '??' ? 'text-ok'
                    : c.status.includes('D') ? 'text-bad' : 'text-warn'}`}>{c.status === '??' ? 'new' : c.status}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-sm">{c.path}</span>
                </div>
              ))}
            </Card>
          )}
          <form onSubmit={(e) => { e.preventDefault(); if (message.trim()) run('commit') }}>
            <Field label="Commit message" value={message} placeholder="What changed"
              onChange={(e) => setMessage(e.target.value)} />
          </form>
          <Button kind="primary" icon={busy === 'commit' ? undefined : GitCommitHorizontal} className="w-full"
            disabled={!message.trim() || !info.changes.length || !!busy} onClick={() => run('commit')}>
            {busy === 'commit' && <Spinner size={18} />} Commit</Button>
          <p className="mt-2 text-sm text-dim">Commit takes every change except LaTeX build files.</p>

          <h2 className="mt-6 mb-2 text-sm font-bold text-dim">History</h2>
          <Card className="py-1">
            {info.history.map((c) => (
              <ListRow key={c.hash} title={c.subject} subtitle={`${c.hash} · ${c.date} · ${c.author}`}
                onClick={() => setShown(c)} />
            ))}
            {!info.history.length && <p className="py-3 text-dim">No commits yet.</p>}
          </Card>
        </>}
      {shown && <CommitSheet where={where} commit={shown} onClose={() => setShown(null)} />}
    </Sheet>
  )
}

function CommitSheet({ where, commit, onClose }: { where: Where; commit: Commit; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    call<string>('latex.git_show', { ...where, commit: commit.hash }).then(setText)
      .catch((e: Error) => setText(e.message))
  }, [where, commit.hash])
  return (
    <Sheet title={commit.subject} onClose={onClose}>
      <p className="mb-3 text-sm text-dim">{commit.hash} · {commit.date} · {commit.author}</p>
      {text === null ? <div className="grid h-40 place-items-center"><Spinner size={28} /></div>
        : <pre className="overflow-x-auto rounded-xl bg-view p-3 font-mono text-xs leading-[18px] select-text">
            {text.split('\n').map((l, i) => (
              <div key={i} className={l.startsWith('+') && !l.startsWith('+++') ? 'bg-ok-bg text-ok'
                : l.startsWith('-') && !l.startsWith('---') ? 'bg-bad-bg text-bad'
                : l.startsWith('@@') ? 'text-accent-text' : ''}>{l || ' '}</div>))}</pre>}
    </Sheet>
  )
}
