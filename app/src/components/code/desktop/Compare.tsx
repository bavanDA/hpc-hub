import { useRef, useState } from 'react'

import { Button, Dialog } from '../../ui'
import { Diff, type DiffHandle } from '../Diff'
import { languageFor, useLanguages } from './lang'

/** Two versions of a file as a diff to pick from: the cluster's against yours, or a kept draft. */
export function CompareDialog({ title, path, base, mine, note, useLabel, onUse, onClose }: {
  title: string
  path: string
  base: string              // the version you start from (the cluster's)
  mine: string              // the version whose changes you pick (yours, the draft)
  note: string
  useLabel: string
  onUse: (text: string) => void
  onClose: () => void
}) {
  useLanguages()
  const handle = useRef<DiffHandle | null>(null)
  const extensions = languageFor(path)  // the same array each time, so the diff isn't rebuilt
  const [left, setLeft] = useState(-1)
  return (
    <Dialog title={title} onClose={onClose} width={900} actions={<>
      <Button kind="ghost" onClick={onClose}>Cancel</Button>
      <Button disabled={left === 0} onClick={() => handle.current?.rejectAll()}>Keep the cluster's</Button>
      <Button kind="primary" onClick={() => { onUse(handle.current?.text() ?? mine); onClose() }}>{useLabel}</Button>
    </>}>
      <p className="mb-3 text-sm text-dim">{note}</p>
      <div className="max-h-[60vh] overflow-auto rounded-md border border-line">
        <Diff original={base} proposed={mine} extensions={extensions} handle={handle} onChange={(_t, n) => setLeft(n)} />
      </div>
    </Dialog>
  )
}
