import { BookOpen, BookOpenText, Headphones } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'

import { ContextMenu } from '../files/ContextMenu'
import { Spinner } from '../ui'
import { Dictionary } from './Dictionary'
import { Pdf, type PdfProps, type WordPick } from './index'
import { Player } from './Player'
import type { Source } from './narrator'
import { store, stored } from './storage'
import { Tool } from './tool'
import { useReader } from './useReader'

const Reflow = lazy(() => import('../reader/Reader'))
const NARROW = 760  // below this the dictionary lies over the PDF instead of beside it
const READING = 'pdf-reading-mode'  // where a double-click opens the source, it looks the word up instead

type ReadableProps = PdfProps & {
  source?: Source
  reflow?: boolean  // the Reader instead of the pages, set by the parent; left out, a toolbar button
  latex?: { cluster: string; main: string }  // the Reader reads this LaTeX source
}

/** The PDF viewer with Read aloud, the dictionary and the Reader. */
export function ReadablePdf({ source, extra, onSync, reflow, latex, ...props }: ReadableProps) {
  const reader = useReader(source)
  const [ownReflow, setOwnReflow] = useState(false)
  const inReader = reflow ?? ownReflow
  const [open, setOpen] = useState(false)
  const [reading, setReading] = useState(() => stored(READING, '0') === '1')
  const read = (on: boolean) => {
    setReading(on)
    store(READING, on ? '1' : '0')
  }
  const [menu, setMenu] = useState<WordPick | null>(null)
  const [word, setWord] = useState<WordPick | null>(null)
  const [narrow, setNarrow] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const seen = new ResizeObserver(() => setNarrow(el.clientWidth < NARROW))
    seen.observe(el)
    return () => seen.disconnect()
  }, [])
  useEffect(() => { setWord(null); setMenu(null) }, [source?.cluster, source?.path])

  const close = () => { reader.close(); setOpen(false) }
  const readFrom = (w: WordPick) => { setOpen(true); reader.readFrom(w.spot) }
  const toggle = source && <Tool label="Read aloud" on={open} disabled={!props.data}
    onClick={() => open ? close() : setOpen(true)}><Headphones size={16} /></Tool>
  const toReader = reflow === undefined && <Tool label="Reader view" disabled={!props.data}
    onClick={() => setOwnReflow(true)}><BookOpenText size={16} /></Tool>
  const mode = onSync && <Tool label={reading ? 'Reading mode: double-click looks a word up' : 'Reading mode'}
    on={reading} disabled={!props.data} onClick={() => read(!reading)}><BookOpen size={16} /></Tool>

  return (
    <div ref={box} className="relative flex h-full min-w-0">
      <div className="relative min-w-0 flex-1">
        <Pdf {...props} reader={reader} extra={<>{mode}{toReader}{toggle}{extra}</>} onWord={setMenu}
          onSync={reading ? undefined : onSync} onLookUp={setWord}
          focus={inReader && props.focus !== undefined ? false : props.focus}
          bar={open && !inReader && <Player reader={reader} onClose={close} />} />
        {inReader && (
          <div className="absolute inset-0 z-10">
            <Suspense fallback={<div className="grid h-full place-items-center bg-window"><Spinner size={24} /></div>}>
              <Reflow data={props.data} latex={latex} memory={props.memory} narrator={reader} aloud={toggle}
                bar={open && <Player reader={reader} onClose={close} />} focus={props.focus} onFocus={props.onFocus}
                onPages={reflow === undefined ? () => setOwnReflow(false) : undefined} />
            </Suspense>
          </div>
        )}
      </div>
      {word && <Dictionary key={`${word.text}:${word.x}:${word.y}`} pick={word} reader={reader} overlay={narrow}
        onRead={() => readFrom(word)} onClose={() => setWord(null)} />}
      {menu && <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} sections={[
        [{ label: `Look up "${menu.text}"`, onClick: () => setWord(menu) }],
        [{ label: 'Read from here', onClick: () => readFrom(menu) }]]} />}
    </div>
  )
}
