import { Archive, ArrowDown, ArrowUp, ChevronRight, Cloud, Pencil, Tag } from 'lucide-react'
import { Fragment, useState } from 'react'

import type { GitState, HCommit, SavedVersion } from '../../../../types/history'
import { clock, fileName, group, plural, when } from '../format'
import { Avatar } from '../ui/Avatar'
import { Counts } from '../ui/Counts'
import { CommitChip } from './CommitChip'
import { CommitItem } from './CommitItem'

export type Sel = { kind: 'now' } | { kind: 'commit'; hash: string } | { kind: 'compare'; from: string; to: string }
  | { kind: 'saved'; hash: string } | { kind: 'sync' }

type Props = {
  state: GitState
  commits: HCommit[]
  saved: SavedVersion[]
  sel: Sel
  query: string
  pulled: Set<string>  // commits that just came in
  aside: number  // changes put aside by a push that is paused
  onSelect: (s: Sel) => void
}

/** Where a hash sits for a compare: "" (now) is above every commit. */
const rank = (commits: HCommit[], h: string) => h === '' ? -1 : commits.findIndex((c) => c.hash === h || c.short === h)

export function CommitList({ state, commits, saved, sel, query, pulled, aside, onSelect }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const q = query.trim().toLowerCase()
  const shown = q ? commits.filter((c) => [c.subject, c.body, c.author, c.hash, ...c.tags, ...c.files.map((f) => f.path)]
    .some((x) => x.toLowerCase().includes(q))) : commits
  const range = sel.kind === 'compare' ? [rank(commits, sel.to), rank(commits, sel.from)] : null
  const inRange = (i: number) => !range || (i >= Math.min(...range) && i <= Math.max(...range))
  const badge = (h: string) => sel.kind !== 'compare' ? null : h === sel.from ? 'From' : h === sel.to ? 'To' : null
  const pick = (h: string, e: React.MouseEvent) => {
    if (e.shiftKey) {
      const other = sel.kind === 'commit' ? sel.hash : sel.kind === 'now' ? '' : sel.kind === 'compare' ? sel.from : null
      if (other !== null && other !== h) {
        const [newer, older] = rank(commits, other) < rank(commits, h) ? [other, h] : [h, other]
        onSelect({ kind: 'compare', from: older, to: newer })
        return
      }
    }
    onSelect(h === '' ? { kind: 'now' } : { kind: 'commit', hash: h })
  }
  const byBase = new Map<string, SavedVersion[]>()
  for (const v of saved) byBase.set(v.base, [...(byBase.get(v.base) ?? []), v])
  const changed = state.changes.reduce((a, c) => [a[0] + c.added, a[1] + c.removed], [0, 0])
  const fold = (key: string, list: SavedVersion[], label: string, first = 0) => {
    if (!list.length || q) return null
    const opened = open.has(key)
    const rows = opened ? list : list.slice(0, first)
    return <>
      {rows.map((v) => (
        <button key={v.hash} onClick={() => onSelect({ kind: 'saved', hash: v.hash })}
          className={`flex h-7 w-full items-center gap-3 pr-3 pl-[26px] text-left text-sm ${sel.kind === 'saved'
            && sel.hash === v.hash ? 'bg-selected font-semibold' : 'text-dim hover:bg-hover'}`}>
          <span className="size-[7px] shrink-0 rounded-full border border-faint" />
          <span className="w-11 shrink-0 tabular-nums text-text">{clock(v.time)}</span>
          <span className="min-w-0 flex-1 truncate">{v.kind}</span>
          <span className="truncate font-mono text-xs">{v.files.length ? fileName(v.files[0]) : ''}</span>
          {state.saved === 'backup' && <Cloud size={13} className="shrink-0 text-faint" aria-label="Also on origin" />}
        </button>
      ))}
      {list.length > rows.length && (
        <button onClick={() => setOpen(new Set(open).add(key))}
          className="flex h-7 w-full items-center gap-2 pr-3 pl-[22px] text-left text-sm text-dim hover:bg-hover">
          <span className="tracking-[2px] text-faint">•••</span>
          {plural(list.length - rows.length, 'saved version')} · {label} <ChevronRight size={13} /></button>
      )}
    </>
  }

  const now = sel.kind === 'now' || sel.kind === 'sync'
  const heads = new Set(shown.map((c, i) => i === 0 || group(c.time) !== group(shown[i - 1].time) ? c.hash : ''))
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-4">
      {!q && (
        <>
          <CommitItem selected={now} dim={!inRange(-1)} badge={badge('')} onClick={(e) => pick('', e)} bar={range ? inRange(-1) : false}
            icon={<span className="grid size-[22px] place-items-center rounded-full border border-dashed border-line-strong
              text-dim"><Pencil size={11} /></span>}
            title={<span className={now ? '' : 'italic text-dim'}>Not committed yet</span>}
            meta={aside ? <><Archive size={12} className="inline" /> Put aside for the push · {plural(aside, 'file')}</>
              : state.changes.length ? `You · ${state.saved_at ? `saved ${when(state.saved_at)}` : 'not saved as a version'}`
              + ` · ${plural(state.changes.length, 'file')}` : 'Nothing changed since your last commit'}
            counts={state.changes.length ? <Counts added={changed[0]} removed={changed[1]} /> : null} />
          {fold('now', saved.filter((v) => v.base === state.head), `since ${clock(saved.filter((v) =>
            v.base === state.head).slice(-1)[0]?.time ?? 0)}`, 3)}
        </>
      )}
      {shown.map((c) => {
        const i = commits.indexOf(c)
        const head = heads.has(c.hash) ? group(c.time) : ''
        const toPush = i < state.ahead && !!state.upstream
        return (
          <Fragment key={c.hash}>
            {head && <div className="px-4 pt-3 pb-1 text-sm font-semibold text-dim">{head}</div>}
            <CommitItem selected={sel.kind === 'commit' && sel.hash === c.hash} dim={!inRange(i)} badge={badge(c.hash)}
              bar={range ? inRange(i) : false} onClick={(e) => pick(c.hash, e)}
              icon={<Avatar name={c.author} faint={!inRange(i)} />}
              title={<>{c.subject}{c.tags.map((t) => <span key={t} className="ml-1.5 inline-flex h-5 items-center gap-1 rounded
                border border-line-strong px-1.5 align-[1px] text-xs font-normal text-dim"><Tag size={10} /> {t}</span>)}</>}
              meta={<>{c.author} · {when(c.time)} · {plural(c.files.length, 'file')}
                {toPush && <CommitChip><ArrowUp size={10} /> to push</CommitChip>}
                {pulled.has(c.hash) && <CommitChip><ArrowDown size={10} /> just pulled</CommitChip>}</>}
              counts={<Counts added={c.added} removed={c.removed} />} />
            {fold(c.hash, saved.filter((v) => c.parents[0] && v.base === c.parents[0]), 'before this commit')}
          </Fragment>
        )
      })}
      {!shown.length && <p className="px-4 py-6 text-center text-sm text-dim">
        {q ? 'No commit matches.' : 'No commits yet.'}</p>}
    </div>
  )
}
