import { HighlightStyle } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

import { isDark } from '../../../theme'

export const highlight = HighlightStyle.define([
  { tag: t.tagName, color: 'var(--cm-command)' },
  { tag: t.keyword, color: 'var(--cm-math)' },
  { tag: t.atom, color: 'var(--cm-arg)' },
  { tag: t.comment, color: 'var(--cm-comment)', fontStyle: 'italic' },
  { tag: t.number, color: 'var(--cm-number)' },
  { tag: t.bracket, color: 'var(--cm-bracket)' },
  { tag: t.string, color: 'var(--cm-string)' },
  { tag: t.invalid, color: 'var(--color-bad)' },
])

export const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '13px', backgroundColor: 'var(--color-view)', color: 'var(--color-text)' },
  '.cm-scroller': { fontFamily: '"Adwaita Mono", "JetBrains Mono", "Cascadia Code", Menlo, Consolas, monospace',
    lineHeight: '1.55' },
  '.cm-content': { caretColor: 'var(--color-text)', padding: '8px 0 40vh' },
  '.cm-gutters': { backgroundColor: 'var(--color-view)', color: 'var(--cm-gutter)', border: 'none',
    paddingLeft: '6px' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--color-text)' },
  '.cm-activeLine': { backgroundColor: 'var(--cm-active-line)' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--color-text)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground':
    { backgroundColor: 'var(--cm-selection) !important' },
  '.cm-line': { padding: '0 16px 0 10px' },
  '&.cm-focused': { outline: 'none' },
}, { dark: isDark() })
