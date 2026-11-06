import { closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab, toggleComment } from '@codemirror/commands'
import { bracketMatching, indentOnInput } from '@codemirror/language'
import { diff } from '@codemirror/merge'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState, type Extension, Transaction } from '@codemirror/state'
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter,
  keymap, lineNumbers } from '@codemirror/view'
import { useEffect, useRef } from 'react'

import { isDark, onThemeChange } from '../../theme'
import { flash, flashLine, selectionOf } from './editorState'
import { detect, detectIndent, indentExtension, type Lang, loadLanguage } from './languages'
import { searchExtension } from './search'
import { slurm } from './slurm'
import { editorTheme, ensureVars, highlight } from './theme'

/** What is selected: offsets, 1-based lines (inclusive) and the text. Empty when only the cursor is there. */
export type Selection = { from: number; to: number; fromLine: number; toLine: number; text: string; empty: boolean }

export type EditorHandle = {
  focus: () => void
  /** Scroll to a line (1-based) and briefly mark it; col is 1-based too. */
  goto: (line: number, col?: number) => void
  line: () => number
  text: () => string
  selection: () => Selection
  setSelection: (from: number, to?: number) => void
  selectLines: (fromLine: number, toLine: number) => void
  replace: (from: number, to: number, text: string) => void
  /** Type text where the cursor is (replacing a selection). */
  insert: (text: string) => void
  /** Swap in a new version of the whole file (an agent's proposal, a reload from the cluster) as small edits, so
   * the cursor stays where it was. undoable false keeps it out of undo (a reload). */
  applyText: (text: string, opts?: { undoable?: boolean }) => void
  setEditable: (on: boolean) => void
  editable: () => boolean
  /** The CodeMirror view, for keys.ts and search.ts commands. Null before mount and after unmount. */
  view: () => EditorView | null
}

type EditorProps = {
  /** A new key starts a new document (another file, or the same file reopened); typing never comes back in. */
  docKey: string
  path: string
  text: string
  /** Start in typing mode instead of view mode (a hardware keyboard, a new file). */
  editable?: boolean
  /** The file can't be changed at all (not UTF-8, too big, no permission, a notebook). */
  readOnly?: boolean
  wrap?: boolean
  fontSize?: number
  /** Where the cursor starts. */
  line?: number
  /** Queues for "#SBATCH --partition=" in Slurm scripts. */
  partitions?: () => string[]
  onChange?: () => void
  onSave?: () => void
  /** Ctrl+F: open the page's own search bar. */
  onFind?: () => void
  onSelection?: (sel: Selection) => void
  onEditable?: (on: boolean) => void
  onLanguage?: (lang: Lang) => void
  handle?: React.RefObject<EditorHandle | null>
  className?: string
}

/** CodeMirror for a file on a cluster. It opens in view mode, so scrolling on a phone never brings up the keyboard. */
export default function Editor({ docKey, path, text, editable: startEditable = false, readOnly = false, wrap = true,
  fontSize = 13, line: startLine, partitions, onChange, onSave, onFind, onSelection, onEditable, onLanguage, handle,
  className = '' }: EditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const latest = useRef({ onChange, onSave, onFind, onSelection, onEditable, onLanguage, partitions, readOnly })
  latest.current = { onChange, onSave, onFind, onSelection, onEditable, onLanguage, partitions, readOnly }
  const parts = useRef({ lang: new Compartment(), look: new Compartment(), wrap: new Compartment(),
    edit: new Compartment(), indent: new Compartment() })

  useEffect(() => {
    ensureVars()
    const c = parts.current
    const lang = detect(path, text)
    const fixed = () => latest.current.readOnly || !!lang.readOnlyReason
    const editing = (on: boolean): Extension => [EditorView.editable.of(on), EditorState.readOnly.of(!on)]
    const run = (fn?: () => void) => () => { if (!fn) return false; fn(); return true }
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: text,
        extensions: [
          lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), history(), drawSelection(),
          indentOnInput(), bracketMatching(), closeBrackets(), highlightSelectionMatches(), searchExtension(),
          flashLine, highlight,
          c.lang.of([]),
          c.indent.of(indentExtension(detectIndent(text, lang.id))),
          c.look.of(editorTheme(isDark(), fontSize)),
          c.wrap.of(wrap ? EditorView.lineWrapping : []),
          c.edit.of(editing(startEditable && !fixed())),
          EditorView.contentAttributes.of({ spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off',
            'aria-label': `Editing ${path.split('/').pop()}` }),
          keymap.of([
            { key: 'Mod-s', run: run(() => latest.current.onSave?.()), preventDefault: true },
            { key: 'Mod-f', run: () => run(latest.current.onFind)(), preventDefault: true },
            { key: 'Mod-/', run: toggleComment },
            ...closeBracketsKeymap, ...completionKeymap, ...searchKeymap, ...historyKeymap, indentWithTab,
            ...defaultKeymap,
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && u.transactions.some((tr) => tr.annotation(Transaction.addToHistory) !== false))
              latest.current.onChange?.()
            if (u.selectionSet || u.docChanged) latest.current.onSelection?.(selectionOf(u.state))
          }),
        ],
      }),
    })
    view.current = v
    latest.current.onLanguage?.(lang)
    let alive = true
    loadLanguage(lang.id).then((ext) => {
      if (!alive) return
      const extra = lang.id === 'slurm' ? slurm({ partitions: () => latest.current.partitions?.() ?? [] }) : []
      v.dispatch({ effects: c.lang.reconfigure([ext, extra]) })
    }).catch(() => { /* no highlighting is still a working editor */ })
    const stopTheme = onThemeChange(() => v.dispatch({ effects: c.look.reconfigure(editorTheme(isDark(), fontSize)) }))

    const setEditable = (on: boolean) => {
      const ok = on && !fixed()
      if (v.state.readOnly === !ok) return
      v.dispatch({ effects: c.edit.reconfigure(editing(ok)) })
      latest.current.onEditable?.(ok)
      if (ok) v.focus()
    }
    const goto = (n: number, col = 1) => {
      const at = v.state.doc.line(Math.max(1, Math.min(n, v.state.doc.lines)))
      const pos = Math.min(at.from + Math.max(0, col - 1), at.to)
      v.dispatch({ selection: { anchor: pos }, effects: [EditorView.scrollIntoView(pos, { y: 'center' }),
        flash.of(at.number)] })
      setTimeout(() => { if (view.current === v) v.dispatch({ effects: flash.of(0) }) }, 1700)
    }
    if (handle) handle.current = {
      focus: () => v.focus(),
      goto,
      line: () => v.state.doc.lineAt(v.state.selection.main.head).number,
      text: () => v.state.doc.toString(),
      selection: () => selectionOf(v.state),
      setSelection: (from, to = from) => v.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true }),
      selectLines: (a, b) => {
        const doc = v.state.doc
        const first = doc.line(Math.max(1, Math.min(a, doc.lines)))
        const last = doc.line(Math.max(first.number, Math.min(b, doc.lines)))
        v.dispatch({ selection: { anchor: first.from, head: last.to }, scrollIntoView: true })
      },
      replace: (from, to, s) => v.dispatch({ changes: { from, to, insert: s }, userEvent: 'input' }),
      insert: (s) => v.dispatch(v.state.replaceSelection(s), { scrollIntoView: true, userEvent: 'input' }),
      applyText: (next, opts = {}) => {
        const now = v.state.doc.toString()
        if (now === next) return
        const changes = diff(now, next).map((ch) => ({ from: ch.fromA, to: ch.toA, insert: next.slice(ch.fromB, ch.toB) }))
        v.dispatch({ changes, annotations: opts.undoable === false ? Transaction.addToHistory.of(false) : [],
          userEvent: opts.undoable === false ? 'reload' : 'input' })
      },
      setEditable,
      editable: () => !v.state.readOnly,
      view: () => view.current,
    }
    if (startLine) goto(startLine)
    return () => {
      alive = false
      stopTheme()
      v.destroy()
      view.current = null
      if (handle) handle.current = null
    }
    // a new document only for a new docKey; typing doesn't come back in through `text`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey])

  useEffect(() => {
    view.current?.dispatch({ effects: parts.current.wrap.reconfigure(wrap ? EditorView.lineWrapping : []) })
  }, [wrap])
  useEffect(() => {
    view.current?.dispatch({ effects: parts.current.look.reconfigure(editorTheme(isDark(), fontSize)) })
  }, [fontSize])
  useEffect(() => {
    // the file became read-only (or writable again) while open, e.g. after a reload
    if (readOnly) handle?.current?.setEditable(false)
  }, [readOnly, handle])

  return <div ref={host} className={`h-full min-h-0 select-text ${className}`} />
}
