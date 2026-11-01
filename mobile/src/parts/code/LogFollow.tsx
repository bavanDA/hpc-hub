// A job's output or a log in the Code tab: read-only, opened at its end. Follow keeps it growing while the job
// runs (it looks again every few seconds and stays at the bottom). Lines of an error that point into a file
// ("File train.py, line 12", "main.c:40:5: error") open that file at that line.
import { useEffect, useRef } from 'react'

import { getFile, reloadFile, type OpenFile } from '@shared/components/code/store'
import { call } from '@shared/rpc'
import type { FileState } from '@shared/types/code'
import { folderOf, spotIn, type Spot } from './util'

export const FOLLOW_EVERY = 3000
const SHOWN = 4000  // lines; a longer log shows its end

type Props = { file: OpenFile; follow: boolean; fontSize: number; onSpot: (s: Spot) => void }

export function LogFollow({ file, follow, fontSize, onSpot }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const atEnd = useRef(true)
  const dir = folderOf(file.path)
  const all = file.text.split('\n')
  const lines = all.length > SHOWN ? all.slice(-SHOWN) : all
  const cut = all.length - lines.length

  // opened at the end, and kept there while following (unless you scrolled up to read)
  useEffect(() => {
    const el = box.current
    if (el && (atEnd.current || cut)) el.scrollTop = el.scrollHeight
  }, [file.key, file.version])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!follow) return
    const t = window.setInterval(() => {
      const f = getFile(file.key)
      if (!f || document.visibilityState !== 'visible') return
      call<FileState[]>('code.stat', { cluster: f.cluster, paths: [f.path] })
        .then(([s]) => { if (s && s.exists && s.sha !== getFile(file.key)?.sha) void reloadFile(file.key) })
        .catch(() => {})
    }, FOLLOW_EVERY)
    return () => clearInterval(t)
  }, [follow, file.key])

  return (
    <div ref={box} onScroll={(e) => {
      const el = e.currentTarget
      atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    }} className="h-full min-h-0 overflow-auto bg-view px-3 py-2 font-mono select-text" style={{ fontSize }}>
      {cut > 0 && <p className="pb-2 font-sans text-sm text-dim">The first {cut.toLocaleString()} lines are left out.</p>}
      {lines.map((line, i) => {
        const spot = spotIn(line, dir)
        return spot
          ? <button key={i} onClick={() => onSpot(spot)}
              className="block w-full text-left whitespace-pre-wrap break-all text-accent-text underline decoration-dotted
                underline-offset-2 active:bg-hover">{line || ' '}</button>
          : <div key={i} className="whitespace-pre-wrap break-all">{line || ' '}</div>
      })}
    </div>
  )
}
