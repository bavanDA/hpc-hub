import './history.css'

import { EditorState, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { History as HistoryIcon, MessageCircleQuestion, StickyNote, UsersRound } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { Blame } from '../../../types/history'
import { blameColumn } from './blame/blameColumn'
import { cells } from './blame/cells'
import { LineCard } from './blame/LineCard'
import { fileName } from './format'
import { git, type Where } from './git'
import type { Go } from './go'
import { History, type HistoryAsk } from './History'
import { notesGutter } from './notes/notesGutter'
import { isLine } from './notes/places'
import { type CardSpot, SpotCard } from './notes/SpotCard'
import { useAssist } from './useAssist'
import { RunningCards } from './write/RunningCards'

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
  agentGuard: (detail: string, run: () => void) => void  // agents always run on a compute node
  nodeWaiting: boolean  // an agent job waits for its node
  reload: () => void  // files changed on the cluster: the tree, the open file and the PDF again
  goTo: (path: string, line: number) => void
  toPdf: (line: number) => void
  toPage: (page: number) => void
  selection: () => { from: number; to: number; text: string } | null  // in the editor
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
  const [spot, setSpot] = useState<CardSpot | null>(null)
  if (a.active && !opened) setOpened(true)

  const send = (kind: HistoryAsk['kind'], hash?: string) => {
    setAsk({ kind, hash, n: Date.now() })
    setOpened(true)
    a.show(true)
  }
  const assist = useAssist({ where: a.where, clusterName: a.clusterName, guard: a.agentGuard, waiting: a.nodeWaiting,
    inHistory: a.active, showHistory: () => send('now') })

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
  // the notes on the file in the editor, as pins in its gutter
  const root = assist.notes?.root ?? ''
  const rel = docPath && root && docPath.startsWith(root + '/') ? docPath.slice(root.length + 1) : ''
  const notes = assist.notes?.notes
  const pins = useMemo(() => (notes ?? []).filter((n) => isLine(n.place) && n.place.path === rel && !n.done)
    .map((n) => ({ id: n.id, n: n.n, done: n.done, text: n.text, line: (n.place as { line: number }).line })), [notes, rel])
  const showNow = useRef(a.show)
  useEffect(() => { showNow.current = a.show })
  const openNote = useCallback((id: string) => {
    setAsk({ kind: 'notes', hash: id, n: Date.now() })
    setOpened(true)
    showNow.current(true)
  }, [])
  const extensions = useMemo(() => [...(paused ? PAUSED : []), ...(blameOn && blame ? [blameColumn(cells(blame), pick)] : []),
    ...(pins.length ? [notesGutter(pins, openNote)] : [])], [paused, blameOn, blame, pick, pins, openNote])

  const toggleBlame = () => {
    const on = !blameOn
    setBlameOn(on)
    if (!on) setCard(null)
    try { localStorage.setItem('latex.blame', on ? '1' : '0') } catch { /* private window */ }
  }

  // Ask about a passage in the editor, or note it: the selection, or the line the cursor is on
  const fromEditor = (mode: CardSpot['mode']) => {
    const s = a.selection()
    if (!s || !rel) return
    const lines = s.from === s.to ? `line ${s.from}` : `lines ${s.from} to ${s.to}`
    setSpot({ id: `ed-${Date.now()}`, mode, title: s.text ? `the selected text in ${fileName(rel)}` : `${fileName(rel)}, ${lines}`,
      about: { kind: 'lines', path: rel, line: s.from, end: s.to, text: s.text || undefined },
      place: { path: rel, line: s.from }, here: rel })
  }
  const go: Go = {
    line: (path, line) => { a.show(false); a.goTo(root ? `${root}/${path}` : path, line) },
    page: (page) => { a.show(false); a.toPage(page) },
  }

  const tab = (
    <button role="radio" aria-checked={a.active} onClick={() => a.show(true)} title="History"
      className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm ${a.active
        ? 'bg-accent font-semibold text-on-accent' : 'text-dim hover:bg-hover hover:text-text'}`}>
      <HistoryIcon size={14} /> History</button>
  )
  const small = 'flex h-7 items-center gap-1.5 rounded-md px-2 text-sm text-dim hover:bg-hover hover:text-text'
  const blameButton = (
    <>
      <button onClick={() => fromEditor('ask')} disabled={!rel} title="Ask the agent about the selected text, or this line"
        className={`${small} disabled:opacity-40`}><MessageCircleQuestion size={14} /> Ask</button>
      <button onClick={() => fromEditor('note')} disabled={!rel} title="Add a note on this line" className={`${small}
        disabled:opacity-40`}><StickyNote size={14} /> Note</button>
      <button onClick={toggleBlame} aria-pressed={blameOn} title="Who last changed each line, and why"
        className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-sm ${blameOn ? 'bg-selected font-semibold text-text'
          : 'text-dim hover:bg-hover hover:text-text'}`}>
        <UsersRound size={14} /> Who changed it</button>
    </>
  )
  const pane = opened && (
    <div className={a.active ? 'min-h-0 flex-1' : 'hidden'}>
      <History where={where} clusterName={a.clusterName} main={a.main} pdf={a.pdf} active={a.active} ask={ask}
        guard={a.guard} onBuild={a.build} onFiles={a.reload} onPause={setPaused} onSave={a.save}
        onOpen={(path, line) => { a.show(false); a.goTo(path, line) }} assist={assist} go={go} onSpot={setSpot} />
    </div>
  )
  const overlay = <>
    {card && blameOn && (
      <LineCard where={where} start={{ path: card.path, line: card.line, at: '' }} x={card.x} y={card.y}
        onClose={() => setCard(null)} onPdf={(line) => { setCard(null); a.toPdf(line) }}
        onHistory={(hash) => { setCard(null); send(hash ? 'commit' : 'now', hash) }} />
    )}
    {spot && <SpotCard key={spot.id} spot={spot} assist={assist} go={go} onClose={() => setSpot(null)} />}
    <RunningCards assist={assist} inHistory={a.active} />
  </>
  return { tab, pane, blameButton, extensions, overlay,
    push: () => send('push'), pull: () => send('pull'), timeline: () => send('timeline') }
}
