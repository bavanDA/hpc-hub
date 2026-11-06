import { type EditorState, StateEffect, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'

import type { Selection } from './Editor'

export const flash = StateEffect.define<number>()
/** The line goto() marks for a moment. */
export const flashLine = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    const e = tr.effects.find((x) => x.is(flash))
    if (!e) return deco.map(tr.changes)
    const n = e.value as number
    if (n < 1 || n > tr.state.doc.lines) return Decoration.none
    const at = tr.state.doc.line(n).from
    return Decoration.set([Decoration.line({ class: 'cm-code-flash' }).range(at)])
  },
  provide: (f) => EditorView.decorations.from(f),
})

export function selectionOf(state: EditorState): Selection {
  const r = state.selection.main
  const fromLine = state.doc.lineAt(r.from).number
  // a selection ending at the very start of a line doesn't take that line
  const end = r.to > r.from && state.doc.lineAt(r.to).from === r.to ? r.to - 1 : r.to
  return { from: r.from, to: r.to, fromLine, toLine: state.doc.lineAt(end).number,
    text: state.sliceDoc(r.from, r.to), empty: r.empty }
}
