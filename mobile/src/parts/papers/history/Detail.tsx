// What is selected in History, under the commit list: not committed yet, a commit, a comparison or a saved version,
// each with its header and the diff or the PDF. The desktop's Detail, stacked for a phone.
import { ArrowLeftRight, ArrowUp, Check, Copy, MessageCircleQuestion, RotateCcw, Sparkles } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import { remember, remembered } from '@shared/components/latex/storage'
import type { Layout, PutBack, Target } from '@shared/components/latex/history/diff/types'
import { fileName, fullDate, lastLine, plural, shortHash, when } from '@shared/components/latex/history/format'
import { git, type Where } from '@shared/components/latex/history/git'
import type { Sel } from '@shared/components/latex/history/list/CommitList'
import type { CardSpot } from '@shared/components/latex/history/notes/SpotCard'
import { PdfView } from '@shared/components/latex/history/pdf/PdfView'
import { Avatar } from '@shared/components/latex/history/ui/Avatar'
import { Counts } from '@shared/components/latex/history/ui/Counts'
import { Seconds } from '@shared/components/latex/history/ui/Seconds'
import type { Assist } from '@shared/components/latex/history/useAssist'
import { VersionPicker } from '@shared/components/latex/history/versions/VersionPicker'
import { Spinner } from '@shared/components/ui/Spinner'
import { copyText } from '@shared/components/terminals/xterm'
import type { About, Changes, GitState, HCommit, Refs, SavedVersion } from '@shared/types/history'
import { Button, ConfirmDialog, Segments, useToast } from '../../../ui'
import { DiffRows } from './DiffRows'
import { DraftCard } from './DraftCard'
import type { AskOpen } from './AssistView'

export type DetailProps = {
  sel: Sel
  where: Where
  state: GitState
  commits: HCommit[]
  saved: SavedVersion[]
  refs: Refs | null
  clusterName: string
  main: string
  pdf: Uint8Array | null
  guard: (what: string, run: () => void) => void
  onOpen: (path: string, line: number) => void
  onFiles: () => void
  onRefresh: () => Promise<void>
  onSel: (s: Sel) => void
  onPickInList: (side: 'from' | 'to') => void
  onCommit: (message: string, push: boolean) => Promise<boolean>
  onCommitSplit: (commits: { message: string; files: string[] }[], push: boolean) => Promise<boolean>
  assist: Assist
  onAsk: (a: AskOpen) => void
  onSpot: (s: CardSpot) => void
  onPin: (id: string) => void
}

const quote = (t: string) => t.length > 40 ? `${t.slice(0, 18)} ... ${t.slice(-14)}` : t

export function Detail(p: DetailProps) {
  const { sel, where, state, commits, saved, assist } = p
  const toast = useToast()
  const [pane, setPaneState] = useState<'latex' | 'pdf'>(() => remembered('history.pane', 'latex'))
  const [layout, setLayoutState] = useState<Layout>(() => remembered('history.layout', 'inline'))
  const [changes, setChanges] = useState<Changes | null>(null)
  const [failed, setFailed] = useState('')
  const [more, setMore] = useState(false)
  const [reloads, setReloads] = useState(0)
  const setPane = (v: 'latex' | 'pdf') => { setPaneState(v); remember('history.pane', v) }
  const setLayout = (v: Layout) => { setLayoutState(v); remember('history.layout', v) }
  const commit = sel.kind === 'commit' ? commits.find((c) => c.hash === sel.hash) ?? null : null
  const version = sel.kind === 'saved' ? saved.find((v) => v.hash === sel.hash) ?? null : null
  const [from, to] = sel.kind === 'commit' ? [commit?.parents[0] ?? '', sel.hash]
    : sel.kind === 'compare' ? [sel.from, sel.to] : sel.kind === 'saved' ? [sel.hash, ''] : ['', '']
  const frm = sel.kind === 'commit' ? '' : from
  const context = more ? 100000 : 3
  useEffect(() => {
    git<Changes>('changes', where, { frm, to, context }).then((c) => { setChanges(c); setFailed('') })
      .catch((e: Error) => setFailed(lastLine(e.message)))
  }, [where, frm, to, context, reloads])
  const load = () => { setFailed(''); setReloads((n) => n + 1) }
  const abs = (path: string) => `${state.root}/${path}`
  const putBack = async (b: PutBack) => {
    try {
      await git('put_back', where, { path: b.path, line: b.line, expect: b.expect, lines: b.lines })
      toast(b.lines.length > 1 ? 'Lines put back' : b.lines.length ? 'Line put back' : 'Removed')
      p.onFiles()
      load()
    } catch (e) { toast(lastLine((e as Error).message), { kind: 'error' }) }
  }
  const at = sel.kind === 'commit' ? sel.hash : sel.kind === 'compare' ? sel.to : ''
  const askOn = (t: Target) => p.onAsk({ about: { kind: 'lines', path: t.path, line: t.line, end: t.end, at, text: t.text,
    diff: t.diff || undefined }, title: t.text ? `the selected text "${quote(t.text)}"`
      : `the change in ${fileName(t.path)}` })
  const noteOn = (t: Target) => p.onSpot({ id: `note-${Date.now()}`, mode: 'note', title: `${fileName(t.path)}, line ${t.line}`,
    about: { kind: 'lines', path: t.path, line: t.line, end: t.end }, place: { path: t.path, line: t.line } })
  const askHead = (about: About, title: string) => () => p.onAsk({ about, title })

  const switcher = <Segments fit value={pane} onChange={setPane} options={[['latex', 'LaTeX'], ['pdf', 'PDF']]} />
  const pdfFrom = sel.kind === 'now' ? state.head : from
  const body = sel.kind === 'commit' && !commit ? null
    : failed ? <p className="px-5 py-10 text-center text-bad">{failed}</p>
    : !changes ? <div className="grid h-32 place-items-center"><Spinner size={22} /></div>
    : pane === 'pdf' ? <div className="phone-tips flex h-[75dvh] flex-col"><PdfView where={where} main={p.main} root={state.root} clusterName={p.clusterName}
        current={p.pdf} from={pdfFrom} to={to} changes={changes} guard={(run) => p.guard('The PDF build', run)}
        onSource={(path, line) => p.onOpen(path, line)} notes={assist.notes?.notes ?? []} onPin={p.onPin} onSpot={p.onSpot} /></div>
    : <DiffRows changes={changes} layout={layout} onLayout={setLayout} onMore={more ? undefined : () => setMore(true)}
        onOpen={(path, line) => p.onOpen(abs(path), line)} note={sel.kind === 'now' ? 'Build files are left out' : undefined}
        onPutBack={sel.kind === 'saved' ? putBack : undefined}
        onAsk={sel.kind === 'saved' ? undefined : askOn} onNote={sel.kind === 'saved' ? undefined : noteOn} />
  return (
    <>
      {sel.kind === 'commit' && commit && <CommitHead commit={commit} switcher={switcher}
        onAsk={askHead({ kind: 'commit', hash: commit.hash }, `commit ${commit.short}`)} />}
      {sel.kind === 'commit' && !commit && <p className="p-5 text-dim">That commit is not in the last 300.</p>}
      {sel.kind === 'now' && <NowHead p={p} switcher={switcher} />}
      {sel.kind === 'compare' && <CompareHead p={p} from={sel.from} to={sel.to} changes={changes} switcher={switcher}
        onAsk={askHead({ kind: 'range', frm: sel.from, to: sel.to }, sel.to ? `the changes from ${shortHash(sel.from)} to ${
          shortHash(sel.to)}` : `the changes since ${shortHash(sel.from)}`)} />}
      {sel.kind === 'saved' && version && <SavedHead p={p} version={version} changes={changes} switcher={switcher}
        onRestored={() => { p.onFiles(); void p.onRefresh().then(() => p.onSel({ kind: 'now' })) }} />}
      {body}
    </>
  )
}

const HEAD = 'flex flex-col gap-2 px-4 py-3'

function NowHead({ p, switcher }: { p: DetailProps; switcher: ReactNode }) {
  const { state, assist } = p
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<'' | 'commit' | 'push'>('')
  const go = async (push: boolean) => {
    if (!message.trim() || busy) return
    setBusy(push ? 'push' : 'commit')
    if (await p.onCommit(message.trim(), push)) setMessage('')
    setBusy('')
  }
  const none = !state.changes.length
  const draft = assist.draft?.result.head === state.head ? assist.draft : null  // written for an older commit: gone
  const job = assist.running('write')
  const waiting = assist.waitingFor === 'write'
  return (
    <div className={HEAD}>
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 text-md font-semibold">Not committed yet</h3>
        {switcher}
      </div>
      <p className="text-sm text-dim">{none ? 'Nothing changed since your last commit.' : <>Your changes since <code
        className="rounded bg-pill px-1 font-mono text-xs">{shortHash(state.head)}</code>{state.saved_at
        ? `, saved ${when(state.saved_at)}` : ''}. Co-authors see them after you commit and push.</>}</p>
      {!none && draft && <DraftCard key={draft.n} assist={assist} draft={draft} state={state} saved={p.saved}
        headTime={p.commits.find((c) => c.hash === state.head)?.time ?? 0} onCommit={p.onCommit} onCommitSplit={p.onCommitSplit} />}
      {!none && !draft && <>
        <div className="flex items-start gap-2">
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Say what changed and why"
            aria-label="Commit message" rows={Math.min(5, Math.max(1, message.split('\n').length))}
            className="min-h-10 min-w-0 flex-1 resize-none rounded-lg bg-soft px-3 py-2.5 text-[13px] leading-5 outline-none
              placeholder:text-faint focus:ring-1 focus:ring-accent" />
          <Button disabled={!!job || waiting || !assist.choice} onClick={assist.write}>
            {job ? <><Spinner size={14} /> Writing, <Seconds from={job.started} /></> : waiting ? <><Spinner size={14} /> Waiting for a node</>
              : <><Sparkles size={16} /> Write message</>}</Button>
        </div>
        <div className="flex items-center gap-2">
          <Button kind="primary" disabled={!message.trim() || !!busy} onClick={() => void go(false)}>
            {busy === 'commit' ? <Spinner size={16} /> : <Check size={16} />} Commit</Button>
          <Button kind="quiet" disabled={!message.trim() || !!busy || !state.remotes.length}
            onClick={() => void go(true)}>{busy === 'push' ? <Spinner size={16} /> : <ArrowUp size={16} />} Commit and push</Button>
        </div>
        <p className="text-xs text-dim">The first line is the summary; a blank line, then the why.</p>
      </>}
    </div>
  )
}

const AskHead = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button onClick={onClick} className="flex h-8 items-center gap-1.5 self-start rounded-md bg-pill px-2.5 text-sm font-semibold
    active:bg-pressed"><MessageCircleQuestion size={14} /> {label}</button>
)

function CommitHead({ commit, switcher, onAsk }: { commit: HCommit; switcher: ReactNode; onAsk: () => void }) {
  const toast = useToast()
  const lines = commit.added + commit.removed
  return (
    <div className={HEAD}>
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 text-md font-semibold select-text">{commit.subject}</h3>
        {switcher}
      </div>
      {commit.body && <p className="whitespace-pre-line text-sm text-dim select-text">{commit.body}</p>}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-dim">
        <Avatar name={commit.author} size={20} />
        <b className="text-text">{commit.author}</b> committed {Date.now() / 1000 - commit.time < 2 * 86400
          ? `${when(commit.time)}, ${fullDate(commit.time)}` : fullDate(commit.time)}
        <button onClick={() => copyText(commit.hash).then((ok) => toast(ok ? 'Commit id copied' : 'Could not copy'))}
          aria-label="Copy the commit id" className="flex items-center gap-1 rounded bg-pill px-1.5 font-mono text-xs active:bg-pressed">
          {commit.short} <Copy size={11} /></button>
        <span>{plural(commit.files.length, 'file')}, {plural(lines, 'line')} changed</span>
        {commit.tags.map((t) => <span key={t} className="rounded border border-line-strong px-1.5 text-xs">{t}</span>)}
      </div>
      <AskHead label="Ask about this commit" onClick={onAsk} />
    </div>
  )
}

function CompareHead({ p, from, to, changes, switcher, onAsk }: { p: DetailProps; from: string; to: string
  changes: Changes | null; switcher: ReactNode; onAsk: () => void }) {
  const { commits, refs, state } = p
  const lo = from === '' ? -1 : commits.findIndex((c) => c.hash === from)
  const hi = to === '' ? -1 : commits.findIndex((c) => c.hash === to)
  const between = lo >= 0 ? commits.slice(Math.max(0, hi), lo) : []
  const authors = [...new Set(between.map((c) => c.author))]
  const names = authors.length > 1 ? `${authors.slice(0, -1).join(', ')} and ${authors[authors.length - 1]}` : authors[0]
  return (
    <div className={HEAD}>
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 text-md font-semibold">Compare</h3>
        {to !== '' && <button onClick={() => p.onSel({ kind: 'compare', from: to, to: from })} aria-label="Swap"
          className="grid size-9 place-items-center rounded-md text-dim active:bg-pressed"><ArrowLeftRight size={15} /></button>}
        {switcher}
      </div>
      <div className="phone-tips flex flex-col gap-1.5">
        <VersionPicker value={from} commits={commits} refs={refs} head={state.head} allowNow={false}
          onPick={(v) => p.onSel({ kind: 'compare', from: v, to })} onPickInList={() => p.onPickInList('from')} />
        <VersionPicker value={to} commits={commits} refs={refs} head={state.head} allowNow
          onPick={(v) => p.onSel({ kind: 'compare', from, to: v })} onPickInList={() => p.onPickInList('to')} />
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-dim">
        <span className="flex -space-x-1">{authors.slice(0, 4).map((a) => <Avatar key={a} name={a} size={20} />)}</span>
        {(between.length > 0 || to === '') && <span>{between.length > 0 ? `${plural(between.length, 'commit')} by ${names}${
          to === '' && state.changes.length ? ', plus your changes' : ''}` : 'Your changes not committed yet'} ·</span>}
        {changes && <span>{plural(changes.files.length, 'file')} <Counts added={changes.added} removed={changes.removed} /></span>}
      </div>
      <AskHead label="Ask about these changes" onClick={onAsk} />
    </div>
  )
}

function SavedHead({ p, version, changes, switcher, onRestored }: { p: DetailProps; version: SavedVersion
  changes: Changes | null; switcher: ReactNode; onRestored: () => void }) {
  const { where } = p
  const toast = useToast()
  const [asking, setAsking] = useState(false)
  const files = changes?.files ?? []
  const copy = async () => {
    const path = files[0]?.path ?? version.files[0]
    if (!path) return
    try {
      const { text } = await git<{ text: string }>('file', where, { at: version.hash, path })
      toast(await copyText(text) ? `Copied ${fileName(path)} as it was at ${when(version.time, true)}` : 'Could not copy')
    } catch (e) { toast(lastLine((e as Error).message), { kind: 'error' }) }
  }
  const restore = async () => {
    try {
      await git('restore', where, { version: version.hash })
      toast('Restored. What you had is a saved version now.')
      onRestored()
    } catch (e) { toast(lastLine((e as Error).message), { kind: 'error' }) }
  }
  const at = when(version.time, true)
  return (
    <div className={HEAD}>
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 text-md font-semibold">Saved version, {at}</h3>
        {switcher}
      </div>
      <p className="text-sm text-dim">{version.kind === 'Saved' || version.kind === 'Compiled' ? 'Saved automatically.'
        : `${version.kind}.`} Not a commit, never pushed with your work. Kept 30 days.</p>
      <p className="text-sm text-dim">Comparing with <b className="text-text">Now</b>
        {changes && <> · {files.length ? `${files.map((f) => fileName(f.path)).slice(0, 3).join(', ')}, ${plural(
          changes.added + changes.removed, 'line')} differ` : 'the same as now'}</>}</p>
      <div className="flex items-center gap-2">
        <Button small icon={Copy} onClick={copy}>Copy text</Button>
        <Button small icon={RotateCcw} onClick={() => setAsking(true)}>Restore this version</Button>
      </div>
      {asking && <ConfirmDialog title={`Restore the paper as it was at ${at}?`} keep="Keep it as it is" confirm="Restore"
        text="Your files go back to this version. What you have now is saved as a version first, so you can come back to it. Nothing is committed."
        onConfirm={() => void restore()} onClose={() => setAsking(false)} />}
    </div>
  )
}

