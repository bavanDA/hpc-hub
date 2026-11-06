import { type Extension, RangeSetBuilder, StateField } from '@codemirror/state'
import { EditorView, gutter, GutterMarker } from '@codemirror/view'

export type GutterPin = { line: number; n: number; done: boolean; text: string; id: string }

class PinMarker extends GutterMarker {
  pins: GutterPin[]
  constructor(pins: GutterPin[]) { super(); this.pins = pins }
  eq(o: PinMarker) { return o.pins.map((p) => p.id + p.done).join() === this.pins.map((p) => p.id + p.done).join() }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-note-pins'
    for (const p of this.pins.slice(0, 2)) {
      const b = document.createElement('span')
      b.className = `note-pin cm-note-pin${p.done ? ' done' : ''}`
      b.textContent = String(p.n)
      b.title = p.text
      b.dataset.note = p.id
      el.append(b)
    }
    return el
  }
}

const pinLook = EditorView.theme({
  '.cm-notes': { width: '24px' },
  '.cm-note-pins': { display: 'flex', alignItems: 'center', height: '100%', paddingLeft: '3px', cursor: 'pointer' },
  '.cm-note-pin': { display: 'inline-grid', placeItems: 'center', width: '16px', height: '16px', borderRadius: '50%',
    fontSize: '10px', fontWeight: '600', fontFamily: 'var(--font-sans)', marginTop: '2px' },
})

/** The column with the notes of the file open in the editor; pick(id) on a click. */
export function notesGutter(pins: GutterPin[], pick: (id: string) => void): Extension {
  const field = StateField.define<GutterPin[]>({ create: () => pins, update: (v) => v })
  return [field, pinLook, gutter({
    class: 'cm-notes',
    markers: (view) => {
      const b = new RangeSetBuilder<GutterMarker>()
      const doc = view.state.doc
      const by = new Map<number, GutterPin[]>()
      for (const p of view.state.field(field)) if (p.line >= 1 && p.line <= doc.lines) by.set(p.line, [...(by.get(p.line) ?? []), p])
      for (const line of [...by.keys()].sort((x, y) => x - y)) b.add(doc.line(line).from, doc.line(line).from, new PinMarker(by.get(line)!))
      return b.finish()
    },
    domEventHandlers: {
      click: (_view, _line, e) => {
        const id = (e.target as HTMLElement).closest<HTMLElement>('[data-note]')?.dataset.note
        if (id) pick(id)
        return !!id
      },
    },
  })]
}
