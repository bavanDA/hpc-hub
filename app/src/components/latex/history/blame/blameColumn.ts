import { type Extension, Prec, StateField } from '@codemirror/state'
import { EditorView, gutter, GutterMarker } from '@codemirror/view'

import { initials } from '../format'
import type { Cell } from './cells'

class Marker extends GutterMarker {
  cell: Cell
  constructor(cell: Cell) { super(); this.cell = cell }
  eq(o: Marker) { return JSON.stringify(o.cell) === JSON.stringify(this.cell) }
  toDOM() {
    const el = document.createElement('div')
    el.className = 'cm-blame-cell'
    const c = this.cell
    el.style.setProperty('--fresh', String(0.15 + 0.85 * (c?.fresh ?? 0)))
    if (c?.first) {
      const who = document.createElement('span')
      who.className = c.uncommitted ? 'cm-blame-who cm-blame-mine' : 'cm-blame-who'
      if (!c.uncommitted) {
        const ini = document.createElement('span')
        ini.className = 'cm-blame-ini'
        ini.textContent = initials(c.who)
        who.append(ini)
      }
      who.append(c.who)
      const age = document.createElement('span')
      age.className = 'cm-blame-age'
      age.textContent = c.age
      el.append(who, age)
    }
    return el
  }
}

const look = EditorView.theme({
  '.cm-blame': { width: '168px', borderRight: '1px solid var(--color-line)', cursor: 'pointer' },
  '.cm-blame-cell': { position: 'relative', display: 'flex', gap: '6px', alignItems: 'flex-start', height: '100%',
    padding: '0 8px 0 10px', fontFamily: 'var(--font-sans)', fontSize: '12px', lineHeight: '20px',
    color: 'var(--color-dim)' },
  '.cm-blame-cell::before': { content: '""', position: 'absolute', left: '0', top: '0', bottom: '0', width: '3px',
    background: 'var(--color-text)', opacity: 'var(--fresh)' },
  '.cm-blame-who': { flex: '1', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '5px', height: '20px' },
  '.cm-blame-mine': { fontStyle: 'italic', color: 'var(--color-dim)' },
  '.cm-blame-ini': { display: 'inline-grid', placeItems: 'center', width: '17px', height: '17px', borderRadius: '50%',
    border: '1px solid var(--color-line-strong)', fontSize: '8px', fontWeight: '600', color: 'var(--color-dim)',
    flexShrink: '0' },
  '.cm-blame-age': { flexShrink: '0', fontVariantNumeric: 'tabular-nums' },
})

/** The column, for CodeEditor's extensions (made again when the data changes). pick(line, x, y) on a click. */
export function blameColumn(data: Cell[], pick: (line: number, x: number, y: number) => void): Extension {
  const field = StateField.define<Cell[]>({ create: () => data, update: (v) => v })
  return [field, look, Prec.highest(gutter({
    class: 'cm-blame',
    lineMarker: (view, line) => new Marker(view.state.field(field)[view.state.doc.lineAt(line.from).number - 1] ?? null),
    initialSpacer: () => new Marker(null),
    domEventHandlers: {
      click: (view, line, e) => {
        const ev = e as MouseEvent
        pick(view.state.doc.lineAt(line.from).number, ev.clientX, ev.clientY)
        return true
      },
    },
  }))]
}
