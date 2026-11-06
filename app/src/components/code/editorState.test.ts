import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'

import { selectionOf } from './editorState'

const doc = 'one\ntwo\nthree\n'
const at = (anchor: number, head = anchor) =>
  selectionOf(EditorState.create({ doc, selection: EditorSelection.single(anchor, head) }))

describe('selectionOf', () => {
  it('is empty for a cursor', () =>
    expect(at(5)).toEqual({ from: 5, to: 5, fromLine: 2, toLine: 2, text: '', empty: true }))

  it('gives the lines and the text of a selection', () =>
    expect(at(1, 10)).toMatchObject({ fromLine: 1, toLine: 3, text: 'ne\ntwo\nth', empty: false }))

  it("doesn't take a line the selection only ends at the start of", () =>
    expect(at(0, 8)).toMatchObject({ fromLine: 1, toLine: 2, text: 'one\ntwo\n' }))
})
