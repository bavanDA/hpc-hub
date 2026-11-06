import { ArrowDown, ArrowUp, ChevronRight, Copy } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { call } from '../../../rpc'
import type { GitInfo } from '../../../types/latex'
import { Button } from '../../ui/Button'
import { Dialog } from '../../ui/Dialog'
import { Spinner } from '../../ui/Spinner'
import { useToast } from '../../useToast'
import { CommitDialog } from './CommitDialog'
import { Prop } from './Prop'
import { lastLine, type Where } from './where'

const DONE = { commit: 'Committed', pull: 'Pulled', push: 'Pushed' }

export function GitDialog({ where, before, onClose, onPulled }:
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
      toast(DONE[what])
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
          : <div className="flex flex-col gap-5 pb-2 text-base">
            <section>
              <h3 className="mb-2 font-semibold">Repository</h3>
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
                <h3 className="font-semibold">Changes</h3>
                <span className="flex-1 text-sm text-dim">
                  {info.changes.length ? `${info.changes.length} changed files` : 'Nothing to commit'}</span>
                <Button className="!h-8" disabled={!!busy} onClick={() => run('pull')}>
                  {busy === 'pull' ? <Spinner size={14} /> : <ArrowDown size={14} />} Pull</Button>
                <Button className="!h-8" disabled={!!busy} onClick={() => run('push')}>
                  {busy === 'push' ? <Spinner size={14} /> : <ArrowUp size={14} />} Push</Button>
              </div>
              <div className="divide-y divide-line overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
                {info.changes.slice(0, 30).map((c) => (
                  <div key={c.path} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className={`w-6 font-mono font-semibold ${c.status === '??' ? 'text-ok' : c.status.includes('D')
                      ? 'text-bad' : 'text-warn'}`}>{c.status === '??' ? 'new' : c.status}</span>
                    <span className="truncate font-mono">{c.path}</span>
                  </div>
                ))}
                <div className="flex gap-2 p-2">
                  <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Commit message"
                    onKeyDown={(e) => e.key === 'Enter' && message.trim() && run('commit')}
                    className="h-9 flex-1 rounded-md bg-pill px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus" />
                  <Button kind="suggested" disabled={!message.trim() || !info.changes.length || !!busy}
                    onClick={() => run('commit')}>{busy === 'commit' && <Spinner size={14} />} Commit</Button>
                </div>
              </div>
              <p className="mt-1.5 text-xs text-dim">Commit takes every change except LaTeX build files.</p>
            </section>
            <section>
              <h3 className="mb-2 font-semibold">History <span className="font-normal text-dim">
                · last {info.history.length} commits</span></h3>
              <div className="divide-y divide-line overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
                {info.history.map((c) => (
                  <button key={c.hash} onClick={() => setShown(c)}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-hover">
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{c.subject}</div>
                      <div className="truncate text-xs text-dim">
                        <span className="font-mono">{c.hash}</span> · {c.date} · {c.author}</div>
                    </div>
                    <ChevronRight size={16} className="text-dim" />
                  </button>
                ))}
                {!info.history.length && <p className="px-4 py-3 text-sm text-dim">No commits yet.</p>}
              </div>
            </section>
          </div>}
      </Dialog>
      {shown && <CommitDialog where={where} commit={shown} onClose={() => setShown(null)} />}
    </>
  )
}
