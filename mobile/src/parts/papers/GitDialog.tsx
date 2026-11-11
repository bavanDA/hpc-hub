// Git for a paper, from the three dots: Get the latest, Push and Compare run in the History view, which pulls first;
// Commit, history and remote is the repository's details. before() saves the open file first.
import { ArrowDown, ArrowUp, Copy, GitCommitHorizontal, History } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { lastLine, type Where } from '@shared/components/latex/git/where'
import { copyText } from '@shared/components/terminals/xterm'
import { Spinner } from '@shared/components/ui/Spinner'
import { call } from '@shared/rpc'
import type { Commit, GitInfo } from '@shared/types/latex'
import { Button, Dialog, Field, MainButton, Row, Section, useToast } from '../../ui'

const DONE = { commit: 'Committed', pull: 'Pulled', push: 'Pushed' }
export type SafeGit = { push: () => void; pull: () => void; timeline: () => void }

export function GitDialog({ where, before, onPulled, safe, onClose }: { where: Where; before: () => Promise<boolean>
  onPulled: () => void; safe: SafeGit; onClose: () => void }) {
  const [details, setDetails] = useState(false)
  if (details) return <RepoDialog where={where} before={before} onPulled={onPulled} onClose={onClose} />
  const go = (fn: () => void) => () => { onClose(); fn() }
  return (
    <Dialog title="Git" width={420} onClose={onClose}>
      <div className="border-t border-line">
        <Row icon={ArrowDown} label="Get the latest" sub="from the remote" onPress={go(safe.pull)} />
        <Row icon={ArrowUp} label="Push" sub="pulls first" onPress={go(safe.push)} />
        <Row icon={History} label="Timeline" sub="compare any two" onPress={go(safe.timeline)} />
        <Row icon={GitCommitHorizontal} label="Commit, history and remote" opens onPress={() => setDetails(true)} />
      </div>
    </Dialog>
  )
}

function RepoDialog({ where, before, onPulled, onClose }:
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
      toast(DONE[what])
      if (what === 'commit') setMessage('')
      if (what === 'pull') onPulled()
      load()
    } catch (e) {
      toast(`Git: ${lastLine((e as Error).message)}`)
    } finally { setBusy('') }
  }

  return (
    <Dialog title="Git" width={520} onClose={onClose}>
      {error ? <p className="px-5 py-8 text-center text-bad">{error}</p>
        : !info ? <div className="grid h-40 place-items-center"><Spinner size={24} /></div>
        : !info.root ? <p className="px-5 py-8 text-center text-dim">{where.folder} is not a git repository.</p>
        : <>
          <div className="border-t border-line">
            <Row label="Branch" value={info.branch || 'Detached'} />
            {info.remotes.length ? info.remotes.map((r) => (
              <Row key={r.name} label={r.name === 'origin' ? 'Remote' : `Remote ${r.name}`}
                sub={<span className="[overflow-wrap:anywhere]">{r.url}</span>}>
                <button aria-label="Copy address" onClick={() => copyText(r.url)
                  .then((ok) => toast(ok ? 'Copied' : 'Could not copy'))}
                  className="grid size-9 shrink-0 place-items-center rounded-md text-dim active:bg-pressed"><Copy size={16} /></button>
              </Row>
            )) : <Row label="Remote" value="None" />}
          </div>
          <div className="flex gap-2 px-5 pt-3">
            <Button className="flex-1" disabled={!!busy} onClick={() => run('pull')}>
              {busy === 'pull' ? <Spinner size={16} /> : <ArrowDown size={16} />} Pull</Button>
            <Button className="flex-1" disabled={!!busy || !info.remotes.length} onClick={() => run('push')}>
              {busy === 'push' ? <Spinner size={16} /> : <ArrowUp size={16} />} Push</Button>
          </div>

          <Section title={info.changes.length ? `${info.changes.length} changed ${info.changes.length === 1 ? 'file' : 'files'}`
            : 'Nothing to commit'}>
            {info.changes.slice(0, 40).map((c) => (
              <div key={c.path} className="flex min-h-11 items-center gap-3 border-b border-line px-5 py-2">
                <span className="w-9 shrink-0 font-mono text-sm font-semibold text-dim">{c.status === '??' ? 'new' : c.status}</span>
                <span className="min-w-0 flex-1 font-mono text-sm break-all">{c.path}</span>
              </div>
            ))}
          </Section>
          {info.changes.length > 0 && (
            <form className="px-5 pt-1" onSubmit={(e) => { e.preventDefault(); if (message.trim()) void run('commit') }}>
              <Field label="Commit message" value={message} placeholder="What changed" onChange={(e) => setMessage(e.target.value)} />
              <MainButton icon={busy === 'commit' ? undefined : GitCommitHorizontal} disabled={!message.trim() || !!busy}
                onClick={() => void run('commit')}>{busy === 'commit' && <Spinner size={16} />} Commit</MainButton>
              <p className="mt-1.5 text-xs text-dim">Commit takes every change except LaTeX build files.</p>
            </form>
          )}

          <Section title={`History · last ${info.history.length} commits`}>
            {info.history.map((c) => (
              <Row key={c.hash} label={c.subject} sub={`${c.hash} · ${c.date} · ${c.author}`} opens
                onPress={() => setShown(c)} />
            ))}
            {!info.history.length && <p className="border-b border-line px-5 py-3 text-dim">No commits yet.</p>}
          </Section>
        </>}
      {shown && <CommitShown where={where} commit={shown} onClose={() => setShown(null)} />}
    </Dialog>
  )
}

function CommitShown({ where, commit, onClose }: { where: Where; commit: Commit; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    call<string>('latex.git_show', { ...where, commit: commit.hash }).then(setText).catch((e: Error) => setText(e.message))
  }, [where, commit.hash])
  return (
    <Dialog title={commit.subject} onClose={onClose}>
      <p className="px-5 pb-2 text-sm text-dim">{commit.hash} · {commit.date} · {commit.author}</p>
      {text === null ? <div className="grid h-40 place-items-center"><Spinner size={24} /></div>
        : <pre className="mx-5 mb-2 overflow-x-auto rounded-lg bg-soft p-3 font-mono text-xs leading-[18px] select-text">
            {text.split('\n').map((l, i) => (
              <div key={i} className={l.startsWith('+') && !l.startsWith('+++') ? 'font-semibold'
                : l.startsWith('-') && !l.startsWith('---') ? 'text-dim' : l.startsWith('@@') ? 'text-dim' : ''}>{l || ' '}</div>))}</pre>}
    </Dialog>
  )
}
