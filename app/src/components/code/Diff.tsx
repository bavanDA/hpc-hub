import { acceptChunk, getChunks, rejectChunk, unifiedMergeView } from '@codemirror/merge'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react'

import { isDark, onThemeChange } from '../../theme'

export type DiffHandle = {
  text: () => string        // the result with your choices so far (changes you haven't decided on count as kept)
  left: () => number        // changes not decided yet
  acceptAll: () => void
  rejectAll: () => void
}

type Props = {
  original: string          // the file as it is ('' for a new file)
  proposed: string
  isNew?: boolean
  extensions?: Extension[]  // the file's language, from the editor; keep the array stable (useMemo)
  onChange?: (text: string, left: number) => void
  handle?: React.RefObject<DiffHandle | null>
  className?: string
}

function control(type: 'accept' | 'reject', action: (e: MouseEvent) => void): HTMLElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = type === 'accept' ? 'Accept' : 'Reject'
  b.className = 'cm-hub-control ' + (type === 'accept' ? 'cm-hub-accept' : 'cm-hub-reject')
  b.onmousedown = (e) => e.preventDefault()  // keep focus where it is
  b.onclick = action
  return b
}

const look = (dark: boolean) => EditorView.theme({
  '&': { fontSize: '13px', backgroundColor: 'var(--color-view)', color: 'var(--color-text)' },
  '.cm-content': { fontFamily: 'var(--font-mono, monospace)' },
  '.cm-gutters': { backgroundColor: 'var(--color-view)', color: 'var(--color-faint)', border: 'none' },
  '.cm-changedLine': { backgroundColor: dark ? 'rgb(38 162 105 / .18)' : 'rgb(38 162 105 / .12)' },
  '.cm-deletedChunk': { backgroundColor: dark ? 'rgb(224 27 36 / .20)' : 'rgb(224 27 36 / .09)',
    paddingTop: '2px', paddingBottom: '2px' },
  '.cm-chunkButtons': { display: 'flex', gap: '8px', padding: '6px 0 4px', position: 'static' },
  '.cm-hub-control': { minHeight: '34px', padding: '0 14px', borderRadius: '6px', fontSize: '13px',
    fontWeight: '600', cursor: 'pointer', border: 'none', fontFamily: 'inherit' },
  '@media (pointer: coarse)': { '.cm-hub-control': { minHeight: '44px', padding: '0 18px', fontSize: '15px' } },
  '.cm-hub-accept': { backgroundColor: 'var(--color-ok-bg)', color: 'var(--color-ok)' },
  '.cm-hub-reject': { backgroundColor: 'var(--color-control)', color: 'var(--color-text)' },
}, { dark })

const NONE: Extension[] = []  // a fixed default: a new [] each render would rebuild the view and lose your choices

/** An agent's proposed change inline, with Accept and Reject on every change. */
export function Diff({ original, proposed, isNew = false, extensions = NONE, onChange, handle, className = '' }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const report = useRef(onChange)
  useLayoutEffect(() => { report.current = onChange })

  useEffect(() => {
    if (!host.current) return
    const left = (s: EditorState) => getChunks(s)?.chunks.length ?? 0
    const theme = new Compartment()
    const state = EditorState.create({
      doc: proposed,
      extensions: [
        lineNumbers(), EditorView.lineWrapping, EditorView.editable.of(false), theme.of(look(isDark())), ...extensions,
        isNew ? [] : unifiedMergeView({ original, mergeControls: control, gutter: true, highlightChanges: true,
          syntaxHighlightDeletions: true, collapseUnchanged: { margin: 3, minSize: 6 } }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged || u.transactions.length) report.current?.(u.state.doc.toString(), isNew ? 0 : left(u.state))
        }),
      ],
    })
    const view = new EditorView({ state, parent: host.current })
    viewRef.current = view
    report.current?.(proposed, isNew ? 0 : left(view.state))
    // only the colors change: the choices made so far stay
    const stopTheme = onThemeChange(() => view.dispatch({ effects: theme.reconfigure(look(isDark())) }))
    return () => {
      stopTheme()
      view.destroy()
      viewRef.current = null
    }
  }, [original, proposed, isNew, extensions])

  useImperativeHandle(handle, () => {
    const each = (fn: (v: EditorView, pos: number) => boolean) => {
      const v = viewRef.current
      if (!v || isNew) return
      for (let guard = 0; guard < 10_000; guard++) {
        const first = getChunks(v.state)?.chunks[0]
        if (!first || !fn(v, first.fromB)) break
      }
    }
    return {
      text: () => viewRef.current?.state.doc.toString() ?? proposed,
      left: () => (isNew || !viewRef.current ? 0 : getChunks(viewRef.current.state)?.chunks.length ?? 0),
      acceptAll: () => each(acceptChunk),
      rejectAll: () => each(rejectChunk),
    }
  }, [isNew, proposed])

  return <div ref={host} className={`overflow-hidden rounded-md border border-line ${className}`} />
}
