// The terminal with its timeline rail: a bar of jumps above, the map on the right, the reading copy over the terminal
// while you are in the history, and the marks. The live terminal underneath is untouched; wrap its element in this.
import { ArrowDownToLine, ArrowDown, ArrowUp, Bookmark, ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import type { Mark } from '../../../types/terminals'
import { IconButton } from '../../ui/IconButton'
import { useToast } from '../../useToast'
import type { Tab } from '../tabs'
import { MarkName, MarkRows, SavedCopy, Sheet, useOutside } from './MarkPanels'
import { Rail } from './Rail'
import { ReadingView, rowHeight } from './ReadingView'
import { hasHistory, useHistory } from './useHistory'
import type { HistoryView } from './view'

type Panel = { kind: 'list' } | { kind: 'name'; mark: Mark; fresh: boolean; y?: number } | { kind: 'saved'; mark: Mark }

/** Called on a phone: Android's Back closes what's open, then leaves reading. */
export type UseBack = (onBack: () => void, active: boolean) => void
const noBack: UseBack = () => {}

function Bar({ view, phone, onList, count }: { view: HistoryView; phone: boolean; onList: () => void; count: number }) {
  const toast = useToast()
  const ib = (icon: typeof ArrowUp, label: string, fn: () => void) => (
    <IconButton icon={icon} label={label} small={!phone} onClick={fn} />
  )
  const prompt = (dir: 1 | -1) => {
    if (view.jumpPrompt(dir) === undefined) toast(view.prompts.length ? (dir > 0 ? 'This is the last prompt' : 'This is the first prompt') : 'No prompts found in this session')
  }
  const mark = (dir: 1 | -1) => {
    if (!view.liveMarks().length) { toast('No marks yet'); return }
    if (!view.jumpMark(dir)) toast(dir > 0 ? 'No more marks below' : 'No more marks above')
  }
  const hint = view.ended ? 'This session has ended. Its marks keep their saved text.'
    : view.reading ? 'Click the gutter to mark, or press M' : 'Scroll up or drag the map to read back'
  return (
    <div role="toolbar" aria-label="History" className={`flex shrink-0 items-center gap-0.5 border-b border-line bg-window
      ${phone ? 'h-10 px-1.5' : 'h-[38px] px-2'}`}>
      {ib(ArrowUp, 'Previous prompt', () => prompt(-1))}
      {ib(ArrowDown, 'Next prompt', () => prompt(1))}
      {!phone && <span className="text-sm text-dim">Prompts</span>}
      <span className="mx-1 h-[18px] w-px shrink-0 bg-line-strong" />
      {ib(ChevronUp, 'Previous mark', () => mark(-1))}
      {ib(ChevronDown, 'Next mark', () => mark(1))}
      {!phone && <span className="text-sm text-dim">Marks</span>}
      <span className="min-w-0 flex-1" />
      {!phone && <span className="truncate text-sm text-dim">{hint}</span>}
      {!phone && <span className="mx-1 h-[18px] w-px shrink-0 bg-line-strong" />}
      <button data-panel-toggle onClick={onList} className={`inline-flex shrink-0 items-center gap-1.5 rounded-md bg-control px-2.5 font-semibold
        hover:bg-pressed ${phone ? 'h-8 text-sm' : 'h-7 text-sm'}`}>
        <Bookmark size={14} /><span>Marks</span>
        <span className="min-w-[17px] rounded-full bg-pill px-1 text-center text-[11px] leading-[17px]">{count}</span>
      </button>
    </div>
  )
}

export function HistoryFrame({ tab, shown, phone = false, useBack = noBack, children }: {
  tab: Tab; shown: boolean; phone?: boolean; useBack?: UseBack; children: ReactNode
}) {
  const view = useHistory(tab, shown)
  const toast = useToast()
  const wrap = useRef<HTMLDivElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const [panel, setPanel] = useState<Panel | null>(null)
  const available = hasHistory(tab)
  const close = () => setPanel(null)

  // back in the reading copy after a panel: the keyboard (M, Escape, arrows) goes there again
  useEffect(() => {
    if (panel === null && view.reading) wrap.current?.querySelector<HTMLElement>('[role=region]')?.focus({ preventScroll: true })
  }, [panel, view])
  useOutside(pop, close, panel?.kind === 'list' && !phone)
  useBack(close, panel !== null)
  useBack(() => view.back(), panel === null && view.reading && shown)

  // the wheel (and a phone's swipe, which sends wheel events) reads back instead of going to tmux; see view.wheel
  useEffect(() => {
    const el = wrap.current
    if (!el || !available) return
    const wheel = (e: WheelEvent) => {
      if ((e.target as Element).closest('[role=region]')) return  // over the reading copy: it scrolls by itself
      if (view.reading) {
        e.preventDefault()
        e.stopPropagation()
        const copy = el.querySelector('[role=region]')
        if (copy) copy.dispatchEvent(new WheelEvent('wheel', { deltaY: e.deltaY, bubbles: false }))
        copy?.scrollBy({ top: e.deltaY })
      } else if (view.wheel(e.deltaY)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    el.addEventListener('wheel', wheel, { capture: true, passive: false })
    return () => el.removeEventListener('wheel', wheel, { capture: true })
  }, [view, available])

  if (!available) return <>{children}</>

  const markRow = (row: number, y?: number) => {
    const block = view.blockAt(row)
    if (!block) return toast('Nothing to mark on that line')
    const name = block.text.split('\n').find((l) => /[a-z0-9]/i.test(l))?.trim().slice(0, 40) ?? 'Mark'
    view.addMark(name, block)
      .then((mark) => setPanel({ kind: 'name', mark, fresh: true, y }))
      .catch((e: Error) => toast(`Could not mark it: ${e.message}`, { kind: 'error' }))
  }

  const openMark = (m: Mark) => {
    close()
    if (m.live) view.goToMark(m)
    else setPanel({ kind: 'saved', mark: m })
  }
  const remove = (m: Mark) => {
    close()
    view.removeMark(m).catch((e: Error) => toast(`Could not remove it: ${e.message}`, { kind: 'error' }))
  }
  const rename = (m: Mark, name: string) => {
    close()
    if (name !== m.name) view.renameMark(m, name).catch((e: Error) => toast(`Could not rename it: ${e.message}`, { kind: 'error' }))
  }

  const list = panel?.kind === 'list' && (
    <MarkRows marks={view.marks} phone={phone} note={toast} onOpen={openMark} onRemove={remove}
      onRename={(m) => setPanel({ kind: 'name', mark: m, fresh: false })} />
  )

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <Bar view={view} phone={phone} count={view.marks.length} onList={() => setPanel(panel?.kind === 'list' ? null : { kind: 'list' })} />
      <div className="flex min-h-0 flex-1">
        <div ref={wrap} className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {children}
          {view.reading && <ReadingView view={view} tab={tab} phone={phone}
            onMark={(r) => markRow(r, (r - view.top) * rowHeight(phone) + 36)} />}
          {view.reading && view.error && (
            <div className="absolute inset-x-0 top-0 z-[6] bg-warn-bg px-3 py-1 text-xs">Could not read the history: {view.error}</div>
          )}
          {view.reading && (
            <button onClick={() => view.back()} className={`absolute bottom-3.5 left-1/2 z-[6] flex -translate-x-1/2 items-center
              gap-1.5 rounded-full bg-accent px-3.5 font-semibold text-on-accent shadow-[var(--shadow-menu)]
              ${phone ? 'h-10' : 'h-8 text-sm'}`}>
              <ArrowDownToLine size={16} /><span>Back to live</span>
              {view.newLines > 0 && <span className="font-normal opacity-90">+{view.newLines}</span>}
            </button>
          )}
        </div>
        <Rail view={view} phone={phone} onOpenMark={openMark} />
      </div>
      {list && (phone
        ? <Sheet onClose={close}><h3 className="flex items-center px-3.5 pt-3 pb-1.5 text-md font-semibold">Marks</h3>
          <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">{list}</div></Sheet>
        : <div ref={pop} className="absolute top-[44px] right-2 z-20 w-[300px] rounded-xl bg-raised p-1.5 shadow-[var(--shadow-menu)]">
          <div className="px-2 pt-1 pb-1.5 text-xs font-semibold text-dim">Marks</div>{list}</div>)}
      {panel?.kind === 'name' && (
        <MarkName mark={panel.mark} phone={phone} y={panel.y} title={panel.fresh ? 'Name this mark' : 'Rename mark'}
          onSave={(n) => rename(panel.mark, n)} onRemove={() => remove(panel.mark)} onClose={close} />
      )}
      {panel?.kind === 'saved' && <SavedCopy mark={panel.mark} ended={view.ended} phone={phone} onClose={close} note={toast} />}
    </div>
  )
}
