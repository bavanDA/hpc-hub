// The history of one terminal tab: what the rail and the reading copy show. Lines come from the cluster on demand, in
// bounded windows, and nothing is read while you just watch the terminal. Rows are counted from the top of the history.
import { call } from '../../../rpc'
import { isDark } from '../../../theme'
import type { HistoryOutline, HistoryWindow, Mark, MarksAnswer } from '../../../types/terminals'
import type { Tab } from '../tabs'
import { ANSI_DARK, ANSI_LIGHT, parseRows, type Row } from './sgr'

export const CHUNK = 200  // lines read from the cluster at once
const MAX_ROWS = 4000  // lines kept in memory, per tab
const BUCKETS = 300
const OUTLINE_FRESH = 20_000  // ms an outline counts as new
const PASS_MS = 1500  // a full screen program or copy mode: the wheel goes to tmux this long after it was last used
const BLOCK_MAX = 150  // furthest a mark grows up or down from the line you pressed
const CHECK_MS = 1500  // while reading, how often the line count is asked again when output arrives

export type BlockRange = [number, number]

/** Grow to the run of non blank lines around row, so a click on a table marks the whole table. */
export function blockAround(row: number, isBlank: (y: number) => boolean | undefined): BlockRange {
  const known = (y: number) => isBlank(y) === false
  if (!known(row)) return [row, row]
  let a = row, b = row
  while (row - a < BLOCK_MAX && known(a - 1)) a--
  while (b - row < BLOCK_MAX && known(b + 1)) b++
  return [a, b]
}

/** The first row after ref in sorted rows, or the last before it; undefined if there is none. */
export function stepFrom(rows: number[], ref: number, dir: 1 | -1): number | undefined {
  return dir > 0 ? rows.find((r) => r > ref) : [...rows].reverse().find((r) => r < ref)
}

const views = new Map<string, HistoryView>()

export function historyOf(tab: Tab): HistoryView {
  let v = views.get(tab.key)
  if (!v) { v = new HistoryView(tab); views.set(tab.key, v) }
  return v
}

export class HistoryView {
  reading = false
  top = 0  // first row on screen, while reading
  visibleRows = 30
  total = 0
  history = 0
  limit = 0
  height = 0
  width = 0
  map: [number, number][] = []
  prompts: number[] = []
  marks: Mark[] = []
  ended = false  // the session itself is gone
  error = ''  // the last read that failed, while the cluster is away
  newLines = 0  // lines of output since you started reading
  flash: { row: number; at: number } | null = null
  jumps = 0  // counts jumps, so the reading copy knows to move (scrolling itself doesn't)
  private outlineAt = 0
  private rows = new Map<number, Row>()
  private pending = new Set<number>()
  private fetchTimer: ReturnType<typeof setTimeout> | undefined
  private passUntil = 0
  private opening = false
  private checking = false
  private checkedAt = 0
  private openedTotal = 0
  private jumpedTo: number | null = null  // the line count when you started reading, for "+N new lines"
  private subscribers = new Set<() => void>()
  private tick = 0

  readonly tab: Tab

  constructor(tab: Tab) { this.tab = tab }

  get version() { return this.tick }

  subscribe = (fn: () => void) => { this.subscribers.add(fn); return () => { this.subscribers.delete(fn) } }

  private changed() { this.tick++; this.subscribers.forEach((fn) => fn()) }

  private where() { return { cluster: this.tab.cluster, session: this.tab.session, node: this.tab.node } }

  // -- what is in the history

  /** The map and the marks, when you open the tab. force: read even if the last one is fresh. */
  refresh(force = false) {
    void this.loadMarks()
    void this.loadOutline(force)
  }

  private async loadOutline(force = false) {
    if (!force && Date.now() - this.outlineAt < OUTLINE_FRESH) return
    this.outlineAt = Date.now()
    try {
      const o = await call<HistoryOutline>('terminals.outline', { ...this.where(), buckets: BUCKETS })
      if (o.gone) { this.gone(); return }
      this.error = ''
      this.setMeta(o)
      this.map = o.map
      this.prompts = o.prompts
      this.changed()
    } catch (e) {
      this.fail(e)
    }
  }

  /** Hovering or grabbing the rail: only re-reads when the map is old. */
  touchRail() { void this.loadOutline() }

  async loadMarks() {
    try {
      const a = await call<MarksAnswer>('terminals.marks', this.where())
      this.marks = a.marks
      if (a.ended) this.ended = true
      this.changed()
    } catch (e) {
      this.fail(e)
    }
  }

  private setMeta(w: Pick<HistoryWindow, 'total' | 'history' | 'limit' | 'height' | 'width'>) {
    this.ended = false
    if (w.history < this.history) {  // trimmed: every line moved up, marks too
      this.rows.clear()
      this.outlineAt = 0
      void this.loadMarks()
    } else if (w.total !== this.total) {
      this.forgetFrom(this.total - this.height)  // the bottom of the screen changed
    }
    this.total = w.total
    this.history = w.history
    this.limit = w.limit
    this.height = w.height
    this.width = w.width
  }

  private forgetFrom(row: number) {
    for (const y of [...this.rows.keys()]) if (y >= row) this.rows.delete(y)
  }

  private gone() {
    this.ended = true
    this.map = []
    this.error = ''
    this.changed()
  }

  private fail(e: unknown) {
    this.error = e instanceof Error ? e.message : String(e)
    this.changed()
  }

  rowAt(y: number): Row | undefined { return this.rows.get(y) }

  isBlank = (y: number): boolean | undefined => {
    const r = this.rows.get(y)
    return r ? !r.plain.trim() : undefined
  }

  private store(w: HistoryWindow) {
    const palette = isDark() ? ANSI_DARK : ANSI_LIGHT
    parseRows(w.rows, palette).forEach((row, i) => this.rows.set(w.start + i, row))
    if (this.rows.size > MAX_ROWS) {  // the ones furthest from where you are go first
      const far = [...this.rows.keys()].sort((a, b) => Math.abs(b - this.top) - Math.abs(a - this.top))
      for (const y of far.slice(0, this.rows.size - MAX_ROWS)) this.rows.delete(y)
    }
  }

  // -- reading

  /** Called when the visible rows change: asks for what is missing, a moment later so a fast drag asks only once. */
  ensure() {
    clearTimeout(this.fetchTimer)
    this.fetchTimer = setTimeout(() => this.fetchMissing(), 90)
  }

  private fetchMissing() {
    const first = Math.max(0, this.top - CHUNK), last = this.top + this.visibleRows + CHUNK
    for (let c = Math.floor(first / CHUNK) * CHUNK; c <= last; c += CHUNK) {
      if (c >= this.total && c > 0) break
      if (!this.pending.has(c) && [...Array(CHUNK).keys()].some((i) => !this.rows.has(c + i) && c + i < this.total)) {
        void this.fetchChunk(c)
      }
    }
  }

  private async fetchChunk(start: number) {
    this.pending.add(start)
    try {
      const w = await call<HistoryWindow>('terminals.history', { ...this.where(), start, count: CHUNK })
      if (w.gone) { this.gone(); return }
      this.setMeta(w)
      this.store(w)
      this.error = ''
      this.changed()
    } catch (e) {
      this.fail(e)
    } finally {
      this.pending.delete(start)
    }
  }

  /** Open the reading copy with row at the top, the rail's or a jump's target. */
  openAt(row: number, flash = false) {
    if (!this.reading) {
      this.reading = true
      this.newLines = 0
      this.openedTotal = this.total
      void this.loadOutline()
    }
    this.top = Math.max(0, Math.min(row, Math.max(this.total - this.visibleRows, 0)))
    if (flash) this.flash = { row, at: Date.now() }
    this.jumps++
    this.ensure()
    this.changed()
  }

  /** From the wheel or a swipe at the live terminal. Answers true if the app took it, false if tmux should have it. */
  wheel(deltaY: number): boolean {
    if (Date.now() < this.passUntil) { this.passUntil = Date.now() + PASS_MS; return false }
    if (deltaY >= 0) return false
    if (!this.opening) void this.openFromBottom(deltaY)
    return true
  }

  /** Scroll up from the live terminal: the last lines, unless a full screen program (or copy mode) has the pane. */
  private async openFromBottom(deltaY: number) {
    this.opening = true
    try {
      const w = await call<HistoryWindow>('terminals.history', { ...this.where(), start: null, count: CHUNK })
      if (w.gone) return this.gone()
      if (w.alternate || w.in_mode) { this.passUntil = Date.now() + PASS_MS; return }
      this.setMeta(w)
      this.store(w)
      this.openAt(Math.max(this.total - this.visibleRows - Math.ceil(-deltaY / 18), 0))
    } catch (e) {
      this.fail(e)
    } finally {
      this.opening = false
    }
  }

  /** The reading copy moved under your finger or the wheel: keep the rail and the rows in step. */
  scrolled(top: number) {
    if (top === this.top) return
    this.top = top
    this.jumpedTo = null  // you moved: Up and Down go from what you see now
    this.ensure()
    this.changed()
  }

  /** Output arrived. A line feed is not a new line: a program that redraws in place (Claude's status, a spinner)
   * sends line feeds all the time without adding to the history, and counting them made the reading copy grow
   * empty rows and jump. While reading, tmux is asked for the real count, at most every CHECK_MS. */
  noteOutput() {
    if (!this.reading || this.checking) return
    const wait = this.checkedAt + CHECK_MS - Date.now()
    this.checking = true
    setTimeout(() => void this.checkTotal(), Math.max(wait, 0))
  }

  private async checkTotal() {
    try {
      if (!this.reading) return
      const w = await call<HistoryWindow>('terminals.history', { ...this.where(), start: null, count: 1 })
      if (w.gone) { this.gone(); return }
      if (!this.reading) return
      const atBottom = this.top + this.visibleRows >= this.total - 5
      this.setMeta(w)
      this.newLines = Math.max(0, this.total - this.openedTotal)
      if (atBottom) this.ensure()
      this.changed()
    } catch {
      // the next output tries again; reading what is there keeps working
    } finally {
      this.checkedAt = Date.now()
      this.checking = false
    }
  }

  back() {
    if (!this.reading) return
    this.reading = false
    this.newLines = 0
    this.flash = null
    this.jumpedTo = null
    this.changed()
    this.tab.term.focus()
  }

  // -- jumping and marking

  /** Where Up and Down step from: the prompt or mark you last jumped to (it sits a few lines below the top, or lower
   * near the end, so the top row would find it again), else the top row while reading, else the end. */
  reference() { return this.jumpedTo ?? (this.reading ? this.top : this.total) }

  private jumpTo(row: number) {
    this.openAt(Math.max(row - 2, 0), false)
    this.jumpedTo = row
    this.flash = { row, at: Date.now() }
  }

  /** The prompt above or below. Below the last one: back to the live terminal. */
  jumpPrompt(dir: 1 | -1): number | undefined {
    const row = stepFrom(this.prompts, this.reference(), dir)
    if (row !== undefined) this.jumpTo(row)
    else if (dir > 0) this.back()
    return row
  }

  liveMarks() { return this.marks.filter((m) => m.live).sort((a, b) => a.line - b.line) }

  jumpMark(dir: 1 | -1): Mark | undefined {
    const live = this.liveMarks()
    const row = stepFrom(live.map((m) => m.line), this.reference(), dir)
    const mark = live.find((m) => m.line === row)
    if (mark) this.goToMark(mark)
    return mark
  }

  goToMark(mark: Mark) {
    this.jumpTo(mark.line)
    this.changed()
  }

  /** The block around row, as text and the marked lines' range, ready to name. undefined: nothing to mark there. */
  blockAt(row: number): { start: number; rows: number; text: string } | undefined {
    const [a, b] = blockAround(row, this.isBlank)
    const lines: string[] = []
    for (let y = a; y <= b; y++) { const r = this.rows.get(y); if (r) lines.push(r.plain) }
    const text = lines.join('\n').trimEnd()
    return text.trim() ? { start: a, rows: b - a + 1, text } : undefined
  }

  async addMark(name: string, block: { start: number; rows: number; text: string }): Promise<Mark> {
    const m = await call<Mark>('terminals.mark_add', { cluster: this.tab.cluster, session: this.tab.session, name, line: block.start, rows: block.rows,
      text: block.text })
    const mark = { ...m, line: block.start, live: true }
    this.marks = [...this.marks, mark]
    this.changed()
    return mark
  }

  async renameMark(mark: Mark, name: string) {
    await call('terminals.mark_rename', { cluster: this.tab.cluster, session: this.tab.session, id: mark.id, name })
    this.marks = this.marks.map((m) => m.id === mark.id ? { ...m, name } : m)
    this.changed()
  }

  async removeMark(mark: Mark) {
    await call('terminals.mark_remove', { cluster: this.tab.cluster, session: this.tab.session, id: mark.id })
    this.marks = this.marks.filter((m) => m.id !== mark.id)
    this.changed()
  }
}

/** Forget a closed tab's history. */
export function dropHistory(key: string) { views.delete(key) }
