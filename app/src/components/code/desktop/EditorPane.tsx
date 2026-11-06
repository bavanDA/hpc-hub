import { FileCode2 } from 'lucide-react'
import { lazy, Suspense, type ReactNode, type RefObject } from 'react'

import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import { Spinner } from '../../ui/Spinner'
import type { EditorHandle } from '../Editor'
import type { Lang } from '../languages'
import { closeFile, openFile, setText, type OpenFile } from '../store'
import { MOD } from './mod'
import { readOnlyKeys } from './readOnly'
import { lineCount } from './text'

const Editor = lazy(() => import('../Editor'))

const spinner = <div className="grid h-full place-items-center"><Spinner size={24} /></div>

/** The middle of the page: the start screen, a note, or the editor for the open file. */
export function EditorPane({ file, start, connected, following, handle, onGoTo, onSave, onFind, onSelection,
  onLanguage }: {
  file: OpenFile | null; start: ReactNode | null; connected: boolean; following: boolean
  handle: RefObject<EditorHandle | null>; onGoTo: () => void; onSave: () => void; onFind: () => void
  onSelection: () => void; onLanguage: (l: Lang) => void
}) {
  return (
    <div className="code-main min-h-0 flex-1">
      {start ? start : !file ? (
        <EmptyState icon={FileCode2} title="No file open"
          text={`Pick a file on the left, or press ${MOD}P to go to one.`}
          action={connected ? <Button onClick={onGoTo}>Go to file</Button> : undefined} />
      ) : file.loading ? spinner : file.error ? (
        <EmptyState icon={FileCode2} title={`Couldn't open ${file.name}`} text={file.error}
          action={<Button onClick={() => { closeFile(file.key); void openFile(file.cluster, file.path) }}>Try again</Button>} />
      ) : (
        <Suspense fallback={spinner}>
          <Editor key={file.key} docKey={file.key} path={file.path} text={file.text} handle={handle}
            editable={file.writable && !readOnlyKeys.has(file.key)} readOnly={!file.writable}
            line={following ? lineCount(file.text) : file.cursor.line}
            onChange={() => { const h = handle.current; if (h) setText(file.key, h.text()) }}
            onSave={onSave} onFind={onFind} onSelection={onSelection} onLanguage={onLanguage} />
        </Suspense>
      )}
    </div>
  )
}
