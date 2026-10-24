// Git for a LaTeX project: the Pull and Push menu, and the dialog with changes, commit, remotes and history.
import { ArrowDown, ArrowUp, ChevronRight, Copy, GitBranch, GitCommitHorizontal } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { GitInfo } from '../../types/latex'
import { useToast } from '../toast'
import { Button, Dialog, Spinner } from '../ui'
import { MenuButton, Popover } from './bits'

type Where = { cluster: string; folder: string }
const lastLine = (s: string) => s.trim().split('\n').pop() ?? s

/** The Git button: Pull, Push, and the dialog. before() saves the open file first. */
export function GitMenu({ where, before, onPulled }: { where: Where; before: () => Promise<boolean>;
  onPulled: () => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState('')
  const [dialog, setDialog] = useState(false)
  const run = async (what: 'pull' | 'push') => {
    if (busy || !(await before())) return
    setBusy(what)
    try {
      await call(`latex.git_${what}`, where)
      toast(what === 'pull' ? 'Pulled' : 'Pushed')
      if (what === 'pull') onPulled()
    } catch (e) {
      toast(`Git: ${lastLine((e as Error).message)}`)
    } finally { setBusy('') }
  }
  return (
    <>
      <Popover width={300} button={(open, toggle) => (
        <button onClick={toggle} title="Pull, push, commit and history"
          className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-bold ${open ? 'bg-selected' : 'hover:bg-hover'}`}>
          {busy ? <Spinner size={14} /> : <GitBranch size={15} />} Git</button>
      )}>
        {(close) => <>
          <MenuButton icon={<ArrowDown size={16} />} label="Pull" hint="from the remote" disabled={!!busy}
            onClick={() => { close(); run('pull') }} />
          <MenuButton icon={<ArrowUp size={16} />} label="Push" hint="to the remote" disabled={!!busy}
            onClick={() => { close(); run('push') }} />
          <div className="my-1 border-t border-line" />
          <MenuButton icon={<GitCommitHorizontal size={16} />} label="Commit, history and remote…"
            onClick={() => { close(); setDialog(true) }} />
        </>}
      </Popover>
      {dialog && <GitDialog where={where} before={before} onClose={() => setDialog(false)} onPulled={onPulled} />}
    </>
  )
}

function GitDialog({ where, before, onClose, onPulled }:
  { where: Where; before: () => Promise<boolean>; onClose: () => void; onPulled: () => void }) {
  const toast = useToast()
  const [info, setInfo] = useState<GitInfo | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const [shown, setShown] = useState<{ hash: string; subject: string } | null>(null)
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
  const copy = (url: string) => navigator.clipboard.writeText(url).then(() => toast('Copied'))
    .catch(() => toast('Could not copy'))

  return (
    <>
      <Dialog title="Git" onClose={onClose} width={720}>
        {error ? <p className="py-8 text-center text-bad">{error}</p>
          : !info ? <div className="grid h-60 place-items-center"><Spinner size={24} /></div>
          : !info.root ? <p className="py-8 text-center text-dim">{where.folder} is not a git repository.</p>
          : <div className="flex flex-col gap-5 pb-2 text-[14px]">
            <section>
              <h3 className="mb-2 font-bold">Repository</h3>
              <div className="divide-y divide-line rounded-xl bg-card shadow-[var(--shadow-card)]">
                <Prop label="Folder" value={info.root} />
                <Prop label="Branch" value={info.branch || '(detached)'} />
                {info.remotes.length ? info.remotes.map((r) => (
                  <Prop key={r.name} label={`Remote ${r.name}`} value={r.url}
                    action={<button aria-label="Copy address" title="Copy address" onClick={() => copy(r.url)}
                      className="grid size-7 place-items-center rounded-md hover:bg-hover"><Copy size={14} /></button>} />
                )) : <Prop label="Remote" value="none" />}
              </div>
            </section>
            <section>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="font-bold">Changes</h3>
                <span className="flex-1 text-[13px] text-dim">
                  {info.changes.length ? `${info.changes.length} changed files` : 'Nothing to commit'}</span>
                <Button className="!h-8" disabled={!!busy} onClick={() => run('pull')}>
                  {busy === 'pull' ? <Spinner size={13} /> : <ArrowDown size={14} />} Pull</Button>
                <Button className="!h-8" disabled={!!busy} onClick={() => run('push')}>
                  {busy === 'push' ? <Spinner size={13} /> : <ArrowUp size={14} />} Push</Button>
              </div>
              <div className="divide-y divide-line overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
                {info.changes.slice(0, 30).map((c) => (
                  <div key={c.path} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                    <span className={`w-6 font-mono font-bold ${c.status === '??' ? 'text-ok' : c.status.includes('D')
                      ? 'text-bad' : 'text-warn'}`}>{c.status === '??' ? 'new' : c.status}</span>
                    <span className="truncate font-mono">{c.path}</span>
                  </div>
                ))}
                <div className="flex gap-2 p-2">
                  <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Commit message"
                    onKeyDown={(e) => e.key === 'Enter' && message.trim() && run('commit')}
                    className="h-9 flex-1 rounded-md bg-pill px-3 text-[14px] outline-none focus:ring-2 focus:ring-accent" />
                  <Button kind="suggested" disabled={!message.trim() || !info.changes.length || !!busy}
                    onClick={() => run('commit')}>{busy === 'commit' && <Spinner size={13} />} Commit</Button>
                </div>
              </div>
              <p className="mt-1.5 text-[12px] text-dim">Commit takes every change except LaTeX build files.</p>
            </section>
            <section>
              <h3 className="mb-2 font-bold">History <span className="font-normal text-dim">
                · last {info.history.length} commits</span></h3>
              <div className="divide-y divide-line overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
                {info.history.map((c) => (
                  <button key={c.hash} onClick={() => setShown(c)}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-hover">
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{c.subject}</div>
                      <div className="truncate text-[12px] text-dim">
                        <span className="font-mono">{c.hash}</span> · {c.date} · {c.author}</div>
                    </div>
                    <ChevronRight size={15} className="text-dim" />
                  </button>
                ))}
                {!info.history.length && <p className="px-4 py-3 text-[13px] text-dim">No commits yet.</p>}
              </div>
            </section>
          </div>}
      </Dialog>
      {shown && <CommitDialog where={where} commit={shown} onClose={() => setShown(null)} />}
    </>
  )
}

function Prop({ label, value, action }: { label: string; value: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-[48px] items-center gap-3 px-4 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="text-[12px] text-dim">{label}</div>
        <div className="truncate select-text font-mono text-[13px]">{value}</div>
      </div>
      {action}
    </div>
  )
}

function CommitDialog({ where, commit, onClose }:
  { where: Where; commit: { hash: string; subject: string }; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    call<string>('latex.git_show', { ...where, commit: commit.hash }).then(setText)
      .catch((e: Error) => setText(e.message))
  }, [where, commit.hash])
  return (
    <Dialog title={`${commit.hash} · ${commit.subject}`} onClose={onClose} width={860}>
      {text === null ? <div className="grid h-60 place-items-center"><Spinner size={24} /></div>
        : <pre className="max-h-[70vh] overflow-auto rounded-lg bg-view p-3 font-mono text-[12px] leading-[18px]
            select-text">{text.split('\n').map((l, i) => (
            <div key={i} className={l.startsWith('+') && !l.startsWith('+++') ? 'bg-ok-bg text-ok'
              : l.startsWith('-') && !l.startsWith('---') ? 'bg-bad-bg text-bad'
              : l.startsWith('@@') ? 'text-accent-text' : ''}>{l || ' '}</div>))}</pre>}
    </Dialog>
  )
}
