import { Circle, History as HistoryIcon, Pencil } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useState } from 'react'

import type { About, Changes, GitState, HCommit, Refs, SavedVersion } from '../../../../types/history'
import { useToast } from '../../../toast'
import { Spinner } from '../../../ui'
import { remember, remembered } from '../../storage'
import { AskBox } from '../ask/AskBox'
import { Thread } from '../ask/Thread'
import type { Sel } from '../CommitList'
import { type Asking, DiffView, type Layout, type PutBack } from '../DiffView'
import { fileName, lastLine, shortHash, when } from '../format'
import { git, type Where } from '../git'
import type { Go } from '../go'
import { isLine } from '../notes/places'
import type { CardSpot } from '../notes/SpotCard'
import { PdfView } from '../PdfView'
import { Segments } from '../ui/Segments'
import type { Assist } from '../useAssist'
import { CommitHead } from './CommitHead'
import { CompareHead } from './CompareHead'
import { NowHead } from './NowHead'
import { SavedHead } from './SavedHead'

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
  go: Go
  onSpot: (s: CardSpot) => void
  onPin: (id: string) => void
}

type AskOpen = { anchor: string; about: About; title: string }
export function Detail(p: DetailProps) {
  const { sel, where, state, commits, saved } = p
  const toast = useToast()
  const [pane, setPaneState] = useState<'latex' | 'pdf'>(() => remembered('history.pane', 'latex'))
  const [layout, setLayoutState] = useState<Layout>(() => remembered('history.layout', sel.kind === 'now' ? 'inline' : 'split'))
  const [changes, setChanges] = useState<Changes | null>(null)
  const [failed, setFailed] = useState('')
  const [more, setMore] = useState(false)
  const [asking, setAsking] = useState<AskOpen | null>(null)
  const setPane = (v: 'latex' | 'pdf') => { setPaneState(v); remember('history.pane', v) }
  const setLayout = (v: Layout) => { setLayoutState(v); remember('history.layout', v) }
  const commit = sel.kind === 'commit' ? commits.find((c) => c.hash === sel.hash) ?? null : null
  const version = sel.kind === 'saved' ? saved.find((v) => v.hash === sel.hash) ?? null : null
  const [from, to] = sel.kind === 'commit' ? [commit?.parents[0] ?? '', sel.hash]
    : sel.kind === 'compare' ? [sel.from, sel.to] : sel.kind === 'saved' ? [sel.hash, ''] : ['', '']
  const load = useCallback(() => {
    setFailed('')
    const frm = sel.kind === 'commit' ? '' : from
    git<Changes>('changes', where, { frm, to, context: more ? 100000 : 3 }).then(setChanges)
      .catch((e: Error) => setFailed(lastLine(e.message)))
  }, [where, sel.kind, from, to, more])
  useEffect(load, [load])
  const abs = (path: string) => `${state.root}/${path}`
  const putBack = async (b: PutBack) => {
    try {
      await git('put_back', where, { path: b.path, line: b.line, expect: b.expect, lines: b.lines })
      toast(b.lines.length > 1 ? 'Lines put back' : b.lines.length ? 'Line put back' : 'Removed')
      p.onFiles()
      load()
    } catch (e) { toast(lastLine((e as Error).message), { kind: 'error' }) }
  }
  const pdfFrom = sel.kind === 'now' ? state.head : from
  // asks: threads under the header ("top") or under a row of the diff, for this selection
  const { assist } = p
  const scope = sel.kind === 'commit' ? `c:${sel.hash}` : sel.kind === 'compare' ? `r:${sel.from}..${sel.to}`
    : sel.kind === 'saved' ? `s:${sel.hash}` : 'now'
  const at = sel.kind === 'commit' ? sel.hash : sel.kind === 'compare' ? sel.to : ''
  const under = (anchor: string): ReactNode => {
    const jobs = assist.jobs.filter((j) => j.kind === 'ask' && j.ask?.scope === scope && j.ask.anchor === anchor)
    const open = asking?.anchor === anchor ? asking : null
    if (!jobs.length && !open) return null
    const here = anchor.split('#')[0]
    const wide = anchor === 'top' ? 'mx-6 my-2' : undefined
    return <>
      {jobs.map((j) => <Thread key={j.id} job={j} go={p.go} here={here} className={wide}
        onNote={(t) => void assist.addNote(t, j.ask?.about.kind === 'lines' ? { path: j.ask.about.path, line: j.ask.about.line }
          : j.ask?.about.kind === 'commit' ? { hash: j.ask.about.hash } : null)}
        onMore={() => j.ask && setAsking({ anchor, about: j.ask.about, title: j.ask.title })}
        onCancel={() => assist.cancel(j.id)} onClose={() => assist.forget(j.id)} />)}
      {open && <AskBox key={open.title} title={open.title} choice={assist.choice} className={wide}
        onClose={() => setAsking(null)} onAsk={(question, pick) => {
          assist.ask({ question, about: open.about, scope, anchor, title: open.title }, pick ?? undefined)
          setAsking(null)
        }} />}
    </>
  }
  const top = under('top')
  const pinsOf = (path: string, n: number) => (assist.notes?.notes ?? [])
    .filter((x) => isLine(x.place) && x.place.path === path && x.place.line === n).map((x) => ({ n: x.n, done: x.done }))
  const quote = (t: string) => t.length > 40 ? `${t.slice(0, 18)} ... ${t.slice(-14)}` : t
  const asks: Asking = {
    onAsk: (t) => setAsking({ anchor: t.anchor, about: { kind: 'lines', path: t.path, line: t.line, end: t.end, at,
      text: t.text, diff: t.diff || undefined }, title: t.text ? `the selected text "${quote(t.text)}"`
      : t.line === t.end ? `line ${t.line}` : `lines ${t.line} to ${t.end}` }),
    onNote: (t) => p.onSpot({ id: `note-${Date.now()}`, mode: 'note', title: `${fileName(t.path)}, line ${t.line}`,
      about: { kind: 'lines', path: t.path, line: t.line, end: t.end }, place: { path: t.path, line: t.line } }),
    under, pins: pinsOf,
  }
  const askHead = (about: About, title: string) => () => setAsking({ anchor: 'top', about, title })

  const body = sel.kind === 'commit' && !commit ? null : failed ? <p className="px-6 py-10 text-center text-bad">{failed}</p>
    : !changes ? <div className="grid flex-1 place-items-center"><Spinner size={22} /></div>
    : pane === 'pdf' ? <PdfView where={where} main={p.main} root={state.root} clusterName={p.clusterName} current={p.pdf}
        from={pdfFrom} to={to} changes={changes} guard={(run) => p.guard('The PDF build', run)}
        onSource={(path, line) => p.onOpen(path, line)} notes={assist.notes?.notes ?? []} onPin={p.onPin}
        onSpot={p.onSpot} />
    : <DiffView changes={changes} layout={layout} onLayout={setLayout} onMore={more ? undefined : () => setMore(true)}
        asking={sel.kind === 'saved' ? undefined : asks}
        onOpen={(path, line) => p.onOpen(abs(path), line)} note={sel.kind === 'now' ? 'Build files are left out' : undefined}
        onPutBack={sel.kind === 'saved' ? putBack : undefined}
        sides={sel.kind === 'commit' && commit ? [<><HistoryIcon size={13} /> Before
          <code className="rounded bg-pill px-1.5 text-xs">{shortHash(from || commit.hash)}</code>
          {commits.find((c) => c.hash === from) && when(commits.find((c) => c.hash === from)!.time)}</>,
          <><Circle size={13} /> After <code className="rounded bg-pill px-1.5 text-xs">{commit.short}</code>
          {when(commit.time)}</>] : sel.kind === 'saved' && version ? [<><Circle size={13} className="text-faint" /> Saved
          version {when(version.time, true)}</>, <><Pencil size={13} /> Now</>] : undefined} />
  const switcher = <Segments value={pane} onChange={setPane} options={[['latex', 'LaTeX'], ['pdf', 'PDF']]} />
  return (
    <>
      {sel.kind === 'commit' && commit && <CommitHead commit={commit} switcher={switcher}
        onAsk={askHead({ kind: 'commit', hash: commit.hash }, `commit ${commit.short}`)} />}
      {sel.kind === 'commit' && !commit && <div className="p-6 text-dim">That commit is not in the last 300.</div>}
      {sel.kind === 'now' && <NowHead {...p} switcher={switcher} />}
      {sel.kind === 'compare' && <CompareHead {...p} from={sel.from} to={sel.to} changes={changes} switcher={switcher}
        onAsk={askHead({ kind: 'range', frm: sel.from, to: sel.to }, sel.to ? `the changes from ${shortHash(sel.from)} to ${
          shortHash(sel.to)}` : `the changes since ${shortHash(sel.from)}`)} />}
      {sel.kind === 'saved' && version && <SavedHead {...p} version={version} changes={changes} switcher={switcher}
        onRestored={() => { p.onFiles(); void p.onRefresh().then(() => p.onSel({ kind: 'now' })) }} />}
      {sel.kind !== 'saved' && top && <div className="shrink-0 border-b border-line py-1">{top}</div>}
      {body}
    </>
  )
}
