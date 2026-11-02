// Git for a paper, full screen: branch and remote, Pull and Push, the changes with a commit message, and the
// history (tap a commit to see what it changed). before() saves the open file first.
import { ArrowDown, ArrowUp, Copy, GitCommitHorizontal } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { copyText } from '@shared/components/terminals/xterm'
import { Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { Commit, GitInfo } from '@shared/types/latex'
import { Button, Field, MainButton, Row, Section, Sheet, useToast } from '../../ui'
import { wrapPath } from '../code/util'

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
    <Sheet flush title="Git" onClose={onClose}>
      {error ? <p className="px-4 py-8 text-center text-bad">{error}</p>
        : !info ? <div className="grid h-40 place-items-center"><Spinner size={28} /></div>
        : !info.root ? <p className="px-4 py-8 text-center text-dim">This folder isn't a git repository.</p>
        : <>
          <div className="border-t border-line">
            <Row label="Branch" value={info.branch || 'Detached'} />
            {info.remotes.length ? info.remotes.map((r) => (
              <Row key={r.name} label={r.name === 'origin' ? 'Remote' : `Remote ${r.name}`}
                sub={wrapPath(r.url)}>
                <button aria-label="Copy address" onClick={() => copyText(r.url)
                  .then((ok) => toast(ok ? 'Address copied' : "Couldn't copy"))}
                  className="-mr-2 grid size-12 shrink-0 place-items-center rounded-full text-dim active:bg-pressed">
                  <Copy size={20} /></button>
              </Row>
            )) : <Row label="Remote" value="None" />}
          </div>
          <div className="flex gap-2 px-4 pt-3">
            <Button className="flex-1" disabled={!!busy} onClick={() => run('pull')}>
              {busy === 'pull' ? <Spinner size={18} /> : <ArrowDown size={20} />} Pull</Button>
            <Button className="flex-1" disabled={!!busy || !info.remotes.length} onClick={() => run('push')}>
              {busy === 'push' ? <Spinner size={18} /> : <ArrowUp size={20} />} Push</Button>
          </div>

          <Section title={info.changes.length ? `${info.changes.length} changed ${info.changes.length === 1 ? 'file' : 'files'}`
            : 'Nothing to commit'}>
            {info.changes.slice(0, 40).map((c) => (
              <div key={c.path} className="flex min-h-12 items-center gap-3 border-b border-line px-4 py-2">
                <span className="w-10 shrink-0 font-mono text-sm font-semibold text-dim">
                  {c.status === '??' ? 'new' : c.status}</span>
                <span className="min-w-0 flex-1 font-mono text-sm break-all">{c.path}</span>
              </div>
            ))}
          </Section>
          {info.changes.length > 0 && (
            <div className="px-4 pt-2">
              <form onSubmit={(e) => { e.preventDefault(); if (message.trim()) run('commit') }}>
                <Field label="Commit message" value={message} placeholder="What changed"
                  onChange={(e) => setMessage(e.target.value)} />
              </form>
              <MainButton icon={busy === 'commit' ? undefined : GitCommitHorizontal}
                disabled={!message.trim() || !!busy} onClick={() => run('commit')}>
                {busy === 'commit' && <Spinner size={18} />} Commit</MainButton>
              <p className="mt-2 text-sm text-dim">Every change goes in, except LaTeX build files.</p>
            </div>
          )}

          <Section title="History">
            {info.history.map((c) => (
              <Row key={c.hash} label={c.subject} sub={`${c.hash} · ${c.date} · ${c.author}`} opens
                onPress={() => setShown(c)} />
            ))}
            {!info.history.length && <p className="border-b border-line px-4 py-3 text-dim">No commits yet.</p>}
          </Section>
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
        : <pre className="overflow-x-auto rounded-[10px] bg-soft p-3 font-mono text-xs leading-[18px] select-text">
            {text.split('\n').map((l, i) => (
              <div key={i} className={l.startsWith('+') && !l.startsWith('+++') ? 'font-semibold'
                : l.startsWith('-') && !l.startsWith('---') ? 'text-dim'
                : l.startsWith('@@') ? 'text-dim' : ''}>{l || ' '}</div>))}</pre>}
    </Sheet>
  )
}
