import type { Extension } from '@codemirror/state'
import { ArrowRight, FileText } from 'lucide-react'
import { lazy, Suspense, type ReactNode, type RefObject } from 'react'

import type { Issue } from '../../types/latex'
import { Spinner } from '../ui'
import type { EditorHandle } from './editor/CodeEditor'
import type { Doc } from './useDoc'

const CodeEditor = lazy(() => import('./editor/CodeEditor'))
const centered = <div className="grid h-full place-items-center"><Spinner size={24} /></div>

type Props = {
  doc: Doc | null
  error: string
  name: string  // the file, relative to the project
  dirty: boolean
  issues: Issue[]
  words: { labels: string[]; cites: string[] }
  editor: RefObject<EditorHandle | null>
  extensions: Extension[]
  blameButton: ReactNode
  onChange: (text: string) => void
  onSave: () => void
  onBuild: () => void
  onToPdf: (line: number) => void
}

export function EditorPane({ doc, error, name, dirty, issues, words, editor, extensions, blameButton, onChange, onSave,
  onBuild, onToPdf }: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-header pl-3 pr-1.5 text-sm">
        <FileText size={14} className="shrink-0 text-dim" />
        <span className="truncate font-semibold" title={doc?.path}>{name}</span>
        {dirty && <span className="size-2 shrink-0 rounded-full bg-accent" title="Not saved yet" />}
        <span className="flex-1" />
        {blameButton}
        <button onClick={() => editor.current && onToPdf(editor.current.line())} title="Show this line in the PDF (Ctrl+J)"
          className="flex h-7 items-center gap-1 rounded-md px-2 text-dim hover:bg-hover hover:text-text">
          To PDF <ArrowRight size={14} /></button>
      </div>
      <div className="min-h-0 flex-1">
        {error ? <p className="p-6 text-center text-sm text-bad">{error}</p>
          : !doc ? centered
          : <Suspense fallback={centered}>
              <CodeEditor key={`${doc.path}:${doc.version}`} path={doc.path} version={doc.version} text={doc.text}
                line={doc.line} issues={issues} words={words} handle={editor} onChange={onChange}
                onSave={onSave} onBuild={onBuild} onToPdf={onToPdf} extensions={extensions} />
            </Suspense>}
      </div>
    </div>
  )
}
