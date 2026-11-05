// What a LaTeX project (Project.tsx) needs for its history: the History tab and its pane, the Who changed it button
// and column for the editor with its card, and asks from the Git menu (Push, Get the latest, the timeline).
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { History as HistoryIcon, UsersRound } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { Blame } from '../../../types/history'
import { blameColumn, cells, LineCard } from './Blame'
import { git, type Where } from './bits'
import { History, type HistoryAsk } from './History'

type Args = {
  where: Where
  clusterName: string
  main: string
  pdf: Uint8Array | null
  docPath: string | null  // the file open in the editor
  docVersion: number
  dirty: boolean
  active: boolean  // the History tab is the one shown
  show: (history: boolean) => void  // to the History tab, or back to the editor
  save: () => Promise<boolean>
  build: () => void
  guard: (what: string, run: () => void) => void
  reload: () => void  // files changed on the cluster: the tree, the open file and the PDF again
  goTo: (path: string, line: number) => void
  toPdf: (line: number) => void
}

const PAUSED: Extension[] = [EditorState.readOnly.of(true), EditorView.editable.of(false)]

function remembered(key: string): boolean {
  try { return localStorage.getItem(key) === '1' } catch { return false }
}

export function useHistoryTab(a: Args) {
  const [opened, setOpened] = useState(a.active)  // mounted once shown, so it keeps its place
  const [ask, setAsk] = useState<HistoryAsk | null>(null)
  const [paused, setPaused] = useState(false)
  const [blameOn, setBlameOn] = useState(() => remembered('latex.blame'))
  const [blame, setBlame] = useState<Blame | null>(null)
  const [card, setCard] = useState<{ path: string; line: number; x: number; y: number } | null>(null)
  useEffect(() => { if (a.active) setOpened(true) }, [a.active])

  const { where, docPath, docVersion, dirty } = a
  const doc = useMemo(() => docPath ? { path: docPath, version: docVersion } : null, [docPath, docVersion])
  useEffect(() => {
    if (!blameOn || !doc || dirty) return
    let dead = false
    git<Blame>('blame', where, { path: doc.path }).then((b) => !dead && setBlame(b)).catch(() => !dead && setBlame(null))
    return () => { dead = true }
  }, [blameOn, doc, dirty, where])

  const pick = useCallback((line: number, x: number, y: number) => {
    if (doc) setCard({ path: doc.path, line, x, y })
  }, [doc])
  const extensions = useMemo(() => [...(paused ? PAUSED : []), ...(blameOn && blame ? [blameColumn(cells(blame), pick)] : [])],
    [paused, blameOn, blame, pick])

  const send = (kind: HistoryAsk['kind'], hash?: string) => {
    setAsk({ kind, hash, n: Date.now() })
    setOpened(true)
    a.show(true)
  }
  const toggleBlame = () => {
    const on = !blameOn
    setBlameOn(on)
    if (!on) setCard(null)
    try { localStorage.setItem('latex.blame', on ? '1' : '0') } catch { /* private window */ }
  }

  const tab = (
    <button role="radio" aria-checked={a.active} onClick={() => a.show(true)} title="History"
      className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm ${a.active
        ? 'bg-accent font-semibold text-on-accent' : 'text-dim hover:bg-hover hover:text-text'}`}>
      <HistoryIcon size={14} /> History</button>
  )
  const blameButton = (
    <button onClick={toggleBlame} aria-pressed={blameOn} title="Who last changed each line, and why"
      className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-sm ${blameOn ? 'bg-selected font-semibold text-text'
        : 'text-dim hover:bg-hover hover:text-text'}`}>
      <UsersRound size={14} /> Who changed it</button>
  )
  const pane = opened && (
    <div className={a.active ? 'min-h-0 flex-1' : 'hidden'}>
      <History where={where} clusterName={a.clusterName} main={a.main} pdf={a.pdf} active={a.active} ask={ask}
        guard={a.guard} onBuild={a.build} onFiles={a.reload} onPause={setPaused} onSave={a.save}
        onOpen={(path, line) => { a.show(false); a.goTo(path, line) }} />
    </div>
  )
  const overlay = card && blameOn && (
    <LineCard where={where} start={{ path: card.path, line: card.line, at: '' }} x={card.x} y={card.y}
      onClose={() => setCard(null)} onPdf={(line) => { setCard(null); a.toPdf(line) }}
      onHistory={(hash) => { setCard(null); send(hash ? 'commit' : 'now', hash) }} />
  )
  return { tab, pane, blameButton, extensions, overlay, paused,
    push: () => send('push'), pull: () => send('pull'), timeline: () => send('timeline') }
}
