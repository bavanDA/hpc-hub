import './latex.css'

import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput, StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import { stex } from '@codemirror/legacy-modes/mode/stex'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap,
  lineNumbers } from '@codemirror/view'
import { useEffect, useRef } from 'react'

import type { Issue } from '../../../types/latex'
import { completions, type Words } from './completions'
import { flash, flashLine, issueLines, setIssues } from './lineMarks'
import { highlight, theme } from './look'

export type EditorHandle = { goto: (line: number) => void; line: () => number
  selection: () => { from: number; to: number; text: string } }  // lines of the selection (or the cursor's) and its text

type Props = {
  path: string  // a new path (or version) starts a new document
  version: number
  text: string
  line?: number  // where to put the cursor when it opens
  issues: Issue[]  // for this file
  words: Words
  onChange: (text: string) => void
  onSave: () => void
  onBuild: () => void
  onToPdf: (line: number) => void
  handle: React.RefObject<EditorHandle | null>
  extensions?: Extension[]  // more, changing while it is open (Who changed it, editing paused)
}

const NONE: Extension[] = []
const TEX = /\.(tex|sty|cls|bib|bbx|cbx|tikz)$/i

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
    const run = (fn: () => void) => () => { fn(); return true }
    const line = (v: EditorView) => v.state.doc.lineAt(v.state.selection.main.head).number
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: text,
        extensions: [
          lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), history(), drawSelection(),
          indentOnInput(), bracketMatching(), closeBrackets(), highlightSelectionMatches(), search({ top: true }),
          EditorView.lineWrapping, theme, issueLines, flashLine, syntaxHighlighting(highlight),
          more.current.of(moreNow.current),
          ...(TEX.test(path) ? [StreamLanguage.define(stex),
            autocompletion({ override: [completions(() => latest.current.words)] })] : []),
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
      selection: () => {
        const r = v.state.selection.main, doc = v.state.doc
        return { from: doc.lineAt(r.from).number, to: doc.lineAt(r.to).number, text: v.state.sliceDoc(r.from, r.to) }
      },
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
