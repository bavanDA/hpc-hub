// Accept and Reject on the phone: a full-width bar of two 48 px buttons under each change of a diff, in place of
// the small buttons the shared Diff puts on the removed lines (they float over the code on a narrow screen).
import { acceptChunk, getChunks, rejectChunk } from '@codemirror/merge'
import { RangeSetBuilder, StateField, type EditorState } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'

class Bar extends WidgetType {
  readonly at: number
  constructor(at: number) { super(); this.at = at }
  eq(other: Bar) { return other.at === this.at }
  toDOM(view: EditorView) {
    const bar = document.createElement('div')
    bar.className = 'cm-hub-bar'
    for (const [label, act] of [['Reject', rejectChunk], ['Accept', acceptChunk]] as const) {
      const b = bar.appendChild(document.createElement('button'))
      b.type = 'button'
      b.textContent = label
      b.onmousedown = (e) => e.preventDefault()
      b.onclick = () => act(view, this.at)
    }
    return bar
  }
}

function bars(state: EditorState): DecorationSet {
  const chunks = getChunks(state)?.chunks ?? []
  const out = new RangeSetBuilder<Decoration>()
  for (const c of chunks) {
    // after the last added line, or under the removed lines when nothing was added
    const added = c.toB > c.fromB
    const pos = added ? state.doc.lineAt(Math.max(c.fromB, c.toB - 1)).to : state.doc.lineAt(c.fromB).from
    out.add(pos, pos, Decoration.widget({ widget: new Bar(c.fromB), block: true, side: added ? 1 : -0.5 }))
  }
  return out.finish()
}

const field = StateField.define<DecorationSet>({
  create: bars,
  update: (_, tr) => bars(tr.state),
  provide: (f) => EditorView.decorations.from(f),
})

const look = EditorView.theme({
  '.cm-deletedChunk .cm-chunkButtons': { display: 'none !important' },
  // an added-only change still gets an empty removed block for the buttons: nothing to show there now
  '.cm-deletedChunk:not(:has(> :not(.cm-chunkButtons)))': { display: 'none' },
  '.cm-hub-bar': { display: 'flex', gap: '8px', padding: '8px 8px 10px 0' },
  '.cm-hub-bar button': {
    flex: '1', minHeight: '48px', borderRadius: '10px', border: '1px solid var(--color-line-strong)',
    backgroundColor: 'var(--color-window)', color: 'var(--color-text)', fontFamily: 'var(--font-sans)',
    fontSize: '15px', fontWeight: '600', cursor: 'pointer',
  },
  '.cm-hub-bar button:active': { backgroundColor: 'var(--color-pressed)' },
})

export const chunkBars = [field, look]
