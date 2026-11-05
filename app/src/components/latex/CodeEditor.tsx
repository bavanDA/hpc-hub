// The LaTeX editor: CodeMirror 6 with a LaTeX mode, line numbers, search, completion of commands, labels and
// citations, and lines with build issues tinted. Loaded on first use, so the main bundle stays small.
import './latex.css'

import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap,
  type CompletionContext } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, HighlightStyle, indentOnInput, StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import { stex } from '@codemirror/legacy-modes/mode/stex'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState, type Extension, RangeSetBuilder, StateEffect, StateField,
  type Transaction } from '@codemirror/state'
import { Decoration, type DecorationSet, drawSelection, EditorView, highlightActiveLine,
  highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { useEffect, useRef } from 'react'

import { isDark } from '../../theme'
import type { Issue } from '../../types/latex'

export type EditorHandle = { goto: (line: number) => void; line: () => number; text: () => string;
  insert: (text: string) => void; focus: () => void }

type Props = {
  path: string  // a new path (or version) starts a new document
  version: number
  text: string
  line?: number  // where to put the cursor when it opens
  issues: Issue[]  // for this file
  words: { labels: string[]; cites: string[] }
  onChange: (text: string) => void
  onSave: () => void
  onBuild: () => void
  onToPdf: (line: number) => void
  handle: React.RefObject<EditorHandle | null>
  extensions?: Extension[]  // more, changing while it is open (Who changed it, editing paused)
}

const style = HighlightStyle.define([
  { tag: t.tagName, color: 'var(--cm-command)' },
  { tag: t.keyword, color: 'var(--cm-math)' },
  { tag: t.atom, color: 'var(--cm-arg)' },
  { tag: t.comment, color: 'var(--cm-comment)', fontStyle: 'italic' },
  { tag: t.number, color: 'var(--cm-number)' },
  { tag: t.bracket, color: 'var(--cm-bracket)' },
  { tag: t.string, color: 'var(--cm-string)' },
  { tag: t.invalid, color: 'var(--color-bad)' },
])

const COMMANDS = ['section{}', 'subsection{}', 'subsubsection{}', 'paragraph{}', 'begin{}', 'end{}', 'label{}',
  'ref{}', 'eqref{}', 'cite{}', 'citep{}', 'citet{}', 'emph{}', 'textbf{}', 'textit{}', 'texttt{}', 'item',
  'includegraphics[width=\\linewidth]{}', 'caption{}', 'centering', 'footnote{}', 'url{}', 'href{}{}', 'input{}',
  'include{}', 'frac{}{}', 'sqrt{}', 'sum', 'int', 'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'lambda', 'mu',
  'sigma', 'theta', 'mathbf{}', 'mathrm{}', 'mathcal{}', 'left(', 'right)', 'cdot', 'times', 'leq', 'geq', 'approx',
  'usepackage{}', 'documentclass{}', 'maketitle', 'tableofcontents', 'newpage', 'clearpage', 'bibliography{}',
  'bibliographystyle{}', 'hline', 'toprule', 'midrule', 'bottomrule', 'vspace{}', 'hspace{}', 'today']
const ENVS = ['equation', 'align', 'figure', 'table', 'tabular', 'itemize', 'enumerate', 'abstract', 'center',
  'description', 'verbatim', 'minipage', 'gather', 'split', 'cases', 'theorem', 'proof', 'lemma']

function completions(words: () => Props['words']) {
  return (ctx: CompletionContext) => {
    const arg = ctx.matchBefore(/\\(\w+)\{([^}]*)$/)
    if (arg) {
      const cmd = arg.text.match(/^\\(\w+)/)![1]
      const open = arg.text.indexOf('{') + 1
      const from = arg.from + open + arg.text.slice(open).lastIndexOf(',') + 1
      const list = /cite/.test(cmd) ? words().cites : /ref$/.test(cmd) ? words().labels
        : cmd === 'begin' || cmd === 'end' ? ENVS : null
      return list ? { from, options: list.map((label) => ({ label, type: 'variable' })) } : null
    }
    const word = ctx.matchBefore(/\\\w*/)
    if (!word || (word.from === word.to && !ctx.explicit)) return null
    return { from: word.from + 1, options: COMMANDS.map((c) => ({ label: c.replace(/[[{(].*$/, ''), detail: c,
      type: 'keyword' })), validFor: /^\w*$/ }
  }
}

// Lines with build issues, and a short flash on the line a jump landed on
const setIssues = StateEffect.define<Issue[]>()
const flash = StateEffect.define<number>()

function lines(f: (tr: Transaction) => [number, string][] | null) {
  return StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(deco, tr) {
      const want = f(tr)
      if (!want) return deco.map(tr.changes)
      const b = new RangeSetBuilder<Decoration>()
      for (const [n, cls] of want) {
        if (n < 1 || n > tr.state.doc.lines) continue
        const at = tr.state.doc.line(n).from
        b.add(at, at, Decoration.line({ class: cls }))
      }
      return b.finish()
    },
    provide: (field) => EditorView.decorations.from(field),
  })
}
const issueLines = lines((tr) => {
  const e = tr.effects.find((x) => x.is(setIssues))
  return e ? [...new Map((e.value as Issue[]).filter((i) => i.line > 0).sort((x, y) => x.line - y.line)
    .map((i) => [i.line, `cm-issue-${i.level}`])).entries()] : null
})
const flashLine = lines((tr) => {
  const e = tr.effects.find((x) => x.is(flash))
  return e ? [[e.value as number, 'cm-flash']] : null
})

const theme = EditorView.theme({
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

const NONE: Extension[] = []

export default function CodeEditor({ path, version, text, line: startLine, issues, words, onChange, onSave, onBuild, onToPdf,
  handle, extensions = NONE }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const more = useRef(new Compartment())
  const moreNow = useRef(extensions)
  moreNow.current = extensions
  const view = useRef<EditorView | null>(null)
  const latest = useRef({ onChange, onSave, onBuild, onToPdf, words, issues })
  latest.current = { onChange, onSave, onBuild, onToPdf, words, issues }

  useEffect(() => {
    const tex = /\.(tex|sty|cls|bib|bbx|cbx|tikz)$/i.test(path)
    const run = (fn: () => void) => () => { fn(); return true }
    const line = (v: EditorView) => v.state.doc.lineAt(v.state.selection.main.head).number
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: text,
        extensions: [
          lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), history(), drawSelection(),
          indentOnInput(), bracketMatching(), closeBrackets(), highlightSelectionMatches(), search({ top: true }),
          EditorView.lineWrapping, theme, issueLines, flashLine, syntaxHighlighting(style),
          more.current.of(moreNow.current),
          ...(tex ? [StreamLanguage.define(stex), autocompletion({ override: [completions(() => latest.current.words)] })]
            : []),
          keymap.of([
            { key: 'Mod-s', run: run(() => latest.current.onSave()), preventDefault: true },
            { key: 'Mod-Enter', run: run(() => latest.current.onBuild()), preventDefault: true },
            { key: 'Mod-b', run: run(() => latest.current.onBuild()), preventDefault: true },
            { key: 'Mod-j', run: (ev) => { latest.current.onToPdf(line(ev)); return true }, preventDefault: true },
            ...closeBracketsKeymap, ...completionKeymap, ...searchKeymap, ...historyKeymap, indentWithTab,
            ...defaultKeymap,
          ]),
          EditorView.updateListener.of((u) => { if (u.docChanged) latest.current.onChange(u.state.doc.toString()) }),
        ],
      }),
    })
    v.dispatch({ effects: setIssues.of(latest.current.issues) })
    view.current = v
    handle.current = {
      goto: (n) => {
        const at = v.state.doc.line(Math.max(1, Math.min(n, v.state.doc.lines)))
        v.dispatch({ selection: { anchor: at.from }, effects: [EditorView.scrollIntoView(at.from, { y: 'center' }),
          flash.of(at.number)] })
        v.focus()
        setTimeout(() => { if (view.current === v) v.dispatch({ effects: flash.of(0) }) }, 1700)
      },
      line: () => line(v),
      text: () => v.state.doc.toString(),
      insert: (s) => v.dispatch(v.state.replaceSelection(s)),
      focus: () => v.focus(),
    }
    if (startLine) handle.current.goto(startLine)
    return () => { v.destroy(); view.current = null }
    // a new document only for a new file or a reload; typing does not come back in through `text`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, version])

  useEffect(() => { view.current?.dispatch({ effects: setIssues.of(issues) }) }, [issues])
  useEffect(() => { view.current?.dispatch({ effects: more.current.reconfigure(extensions) }) }, [extensions])

  return <div ref={host} className="h-full min-h-0 select-text" />
}
