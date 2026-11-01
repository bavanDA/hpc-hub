// The Code editor's look: colors from the app's tokens, light and dark, and one highlight style for every language
// (docs/design/code.md). The colors live in CSS variables set here once, so switching Appearance needs no rebuild of
// the highlight style, only of the dark flag that CodeMirror uses for its own defaults.
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

const VARS = `
:root {
  --code-keyword: #9141ac; --code-string: #137140; --code-comment: #6f6e73; --code-number: #a34d00;
  --code-function: #1b65c4; --code-type: #0b6f73; --code-meta: #9c4f00; --code-atom: #9141ac;
  --code-property: #1b65c4; --code-heading: #1b65c4; --code-operator: rgb(0 0 6 / 0.62);
  --code-gutter: rgb(0 0 6 / 0.40); --code-active-line: rgb(28 113 216 / 0.06);
  --code-selection: rgb(28 113 216 / 0.22); --code-match: rgb(229 165 10 / 0.30);
  --code-match-current: rgb(230 97 0 / 0.42); --code-flash: rgb(28 113 216 / 0.20);
}
:root[data-theme="dark"] {
  --code-keyword: #dc8add; --code-string: #8ff0a4; --code-comment: #9a9996; --code-number: #ffa348;
  --code-function: #7cb1f0; --code-type: #6bd8db; --code-meta: #f8b26a; --code-atom: #dc8add;
  --code-property: #7cb1f0; --code-heading: #7cb1f0; --code-operator: rgb(255 255 255 / 0.64);
  --code-gutter: rgb(255 255 255 / 0.36); --code-active-line: rgb(124 177 240 / 0.07);
  --code-selection: rgb(124 177 240 / 0.28); --code-match: rgb(229 165 10 / 0.28);
  --code-match-current: rgb(255 163 72 / 0.45); --code-flash: rgb(124 177 240 / 0.22);
}
.cm-code-hidden-panel { display: none; }
@keyframes cm-code-flash { from { background: var(--code-flash); } to { background: transparent; } }
.cm-code-flash { animation: cm-code-flash 1.6s ease-out; }
@media (prefers-reduced-motion: reduce) { .cm-code-flash { animation: none; } }
`

let injected = false

/** The color variables, added to the page the first time an editor opens. */
export function ensureVars() {
  if (injected || typeof document === 'undefined') return
  injected = true
  const style = document.createElement('style')
  style.dataset.hpchub = 'code-editor'
  style.textContent = VARS
  document.head.appendChild(style)
}

const style = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword, t.definitionKeyword], color: 'var(--code-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp, t.character], color: 'var(--code-string)' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: 'var(--code-comment)', fontStyle: 'italic' },
  { tag: [t.number, t.integer, t.float], color: 'var(--code-number)' },
  { tag: [t.bool, t.null, t.atom, t.self], color: 'var(--code-atom)' },
  { tag: [t.function(t.variableName), t.function(t.definition(t.variableName)), t.function(t.propertyName)],
    color: 'var(--code-function)' },
  { tag: [t.typeName, t.className, t.namespace, t.standard(t.typeName)], color: 'var(--code-type)' },
  { tag: [t.propertyName, t.attributeName, t.labelName], color: 'var(--code-property)' },
  { tag: [t.meta, t.annotation, t.processingInstruction, t.macroName], color: 'var(--code-meta)' },
  { tag: [t.operator, t.punctuation, t.bracket, t.separator], color: 'var(--code-operator)' },
  { tag: t.tagName, color: 'var(--code-function)' },
  { tag: t.heading, color: 'var(--code-heading)', fontWeight: '600' },
  { tag: t.strong, fontWeight: '600' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: [t.link, t.url], color: 'var(--code-function)', textDecoration: 'underline' },
  { tag: t.invalid, color: 'var(--color-bad)' },
])

/** Token colors for every language. */
export const highlight: Extension = syntaxHighlighting(style)

/** Sizes, surfaces and selection. dark only tells CodeMirror which built-in defaults to use. */
export function editorTheme(dark: boolean, fontSize = 13): Extension {
  return EditorView.theme({
    '&': { height: '100%', fontSize: `${fontSize}px`, backgroundColor: 'var(--color-view)',
      color: 'var(--color-text)' },
    '.cm-scroller': { fontFamily: '"Adwaita Mono", "JetBrains Mono", "Cascadia Code", Menlo, Consolas, monospace',
      lineHeight: '1.55' },
    '.cm-content': { caretColor: 'var(--color-text)', padding: '8px 0 40vh' },
    '.cm-gutters': { backgroundColor: 'var(--color-view)', color: 'var(--code-gutter)', border: 'none',
      paddingLeft: '6px' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--color-text)' },
    '.cm-activeLine': { backgroundColor: 'var(--code-active-line)' },
    '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--color-text)' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground':
      { backgroundColor: 'var(--code-selection) !important' },
    '.cm-line': { padding: '0 16px 0 10px' },
    '&.cm-focused': { outline: 'none' },
    '.cm-searchMatch': { backgroundColor: 'var(--code-match)' },
    '.cm-searchMatch-selected': { backgroundColor: 'var(--code-match-current)' },
    '.cm-selectionMatch': { backgroundColor: 'var(--code-active-line)' },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': { backgroundColor: 'var(--code-selection)',
      outline: 'none' },
    // the shell mode calls these lines comments; the Slurm colors win over that
    '.cm-sbatch, .cm-sbatch span': { color: 'var(--code-meta) !important', fontWeight: '600',
      fontStyle: 'normal !important' },
    '.cm-sbatch-flag, .cm-sbatch-flag span': { color: 'var(--code-property) !important',
      fontStyle: 'normal !important' },
    '.cm-sbatch-value, .cm-sbatch-value span': { color: 'var(--code-string) !important',
      fontStyle: 'normal !important' },
    '.cm-tooltip': { backgroundColor: 'var(--color-raised, var(--color-view))', color: 'var(--color-text)',
      border: '1px solid var(--color-line)', borderRadius: '8px' },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--color-accent)', color: '#fff' },
  }, { dark })
}
