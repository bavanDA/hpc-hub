import { cursorCharLeft, cursorCharRight, cursorLineDown, cursorLineUp, indentLess, indentMore, insertTab, redo,
  undo } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'

import type { LangId } from './languages'

type KeyAction = {
  id: string
  label: string   // what the key shows
  title: string   // for screen readers and long-press hints
  run: (view: EditorView) => boolean
}

const type = (text: string) => (view: EditorView) => {
  if (view.state.readOnly) return false
  view.dispatch(view.state.replaceSelection(text), { scrollIntoView: true, userEvent: 'input.type' })
  return true
}

/** Tab indents a selection, else types an indent where the cursor is. */
const tab = (view: EditorView) => (view.state.selection.ranges.some((r) => !r.empty) ? indentMore(view) : insertTab(view))

const BASE_KEYS: KeyAction[] = [
  { id: 'tab', label: 'Tab', title: 'Indent', run: tab },
  { id: 'dedent', label: '⇤', title: 'Remove indent', run: indentLess },
  { id: 'left', label: '←', title: 'Left', run: cursorCharLeft },
  { id: 'right', label: '→', title: 'Right', run: cursorCharRight },
  { id: 'up', label: '↑', title: 'Up', run: cursorLineUp },
  { id: 'down', label: '↓', title: 'Down', run: cursorLineDown },
  { id: 'undo', label: '↶', title: 'Undo', run: undo },
  { id: 'redo', label: '↷', title: 'Redo', run: redo },
]

const SYMBOLS: Partial<Record<LangId, string[]>> = {
  python: [':', '(', ')', '[', ']', '=', '_', '#', '"', "'"],
  shell: ['$', '{', '}', '|', '>', '&', ';', '"', "'", '#', '/'],
  c: ['{', '}', ';', '(', ')', '[', ']', '<', '>', '*', '&'],
  fortran: ['(', ')', '=', ',', ':', '!', '*', '%', "'"],
  latex: ['\\', '{', '}', '$', '^', '_', '&', '%', '[', ']'],
  r: ['<-', '(', ')', '[', ']', '%', '$', '"', "'", '#'],
  julia: ['(', ')', '[', ']', '=', '.', ':', '"', '#', '$'],
  matlab: ['(', ')', '[', ']', ';', '%', '.', "'", '='],
  markdown: ['#', '*', '_', '`', '[', ']', '(', ')', '-', '>'],
  json: ['{', '}', '[', ']', ':', ',', '"'],
  yaml: [':', '-', '#', '"', "'", '[', ']', '{', '}'],
}
const SAME: Partial<Record<LangId, LangId>> = { slurm: 'shell', makefile: 'shell', cmake: 'shell', cpp: 'c',
  cuda: 'c', bibtex: 'latex', toml: 'yaml', ipynb: 'json' }
const OTHER = ['(', ')', '[', ']', '{', '}', ':', '=', '"', "'", '#', '-', '/']

function symbolKeys(id: LangId): KeyAction[] {
  const list = SYMBOLS[id] ?? SYMBOLS[SAME[id] ?? 'plain'] ?? OTHER
  return list.map((s) => ({ id: `sym:${s}`, label: s, title: `Type ${s}`, run: type(s) }))
}

/** The phone's key row over the keyboard: editing keys first, then the symbols the language needs most. */
export function keyRow(id: LangId): KeyAction[] {
  return [...BASE_KEYS, ...symbolKeys(id)]
}
