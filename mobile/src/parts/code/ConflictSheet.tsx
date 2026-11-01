// Two versions of a file side by side, as one diff you can settle change by change: yours against the cluster's
// (a save that found a newer file, or "Compare" on the changed banner), or a draft from earlier against what is
// open now. What you keep from the diff is what gets saved or put in the editor.
import { useEffect, useMemo, useRef, useState } from 'react'

import { Diff, type DiffHandle } from '@shared/components/code/Diff'
import { reloadFile, replaceText, saveFile, type OpenFile } from '@shared/components/code/store'
import { copyText } from '@shared/components/terminals/xterm'
import { call } from '@shared/rpc'
import type { OpenedFile } from '@shared/types/code'
import { Button, Sheet, useToast } from '../../ui'
import { languageFor } from './util'

export type Compare =
  | { kind: 'cluster'; file: OpenFile }                // yours vs the cluster's now
  | { kind: 'draft'; file: OpenFile; draft: string }   // the open text vs edits kept from earlier

type Props = { compare: Compare; clusterName: string; onDone: (msg?: string) => void }

export function ConflictSheet({ compare, clusterName, onDone }: Props) {
  const toast = useToast()
  const f = compare.file
  const [theirs, setTheirs] = useState<string | null>(compare.kind === 'draft' ? f.text : null)
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)
  const handle = useRef<DiffHandle | null>(null)
  const ext = useMemo(() => languageFor(f.path), [f.path])

  useEffect(() => {
    if (compare.kind !== 'cluster') return
    call<OpenedFile>('code.open', { cluster: f.cluster, path: f.path })
      .then((o) => setTheirs(o.text)).catch((e: Error) => setProblem(e.message))
  }, [compare.kind, f.cluster, f.path])

  const mine = compare.kind === 'draft' ? compare.draft : f.text
  const result = () => handle.current?.text() ?? mine

  async function keep() {
    setBusy(true)
    replaceText(f.key, result())
    const r = await saveFile(f.key, true)
    setBusy(false)
    if (r.saved) onDone('Saved')
    else setProblem(r.conflict ? 'It changed again. Try once more.' : r.error)
  }

  async function useTheirs() {
    await reloadFile(f.key, false)
    onDone(`Using the version on ${clusterName}`)
  }

  return (
    <Sheet title={compare.kind === 'draft' ? 'Your earlier edits' : `${f.name} on ${clusterName}`} onClose={() => onDone()}
      actions={compare.kind === 'draft'
        ? <>
            <Button className="flex-1" onClick={() => onDone()}>Not now</Button>
            <Button kind="primary" className="flex-1" disabled={theirs === null}
              onClick={() => { replaceText(f.key, result()); onDone('In the editor. Save when ready.') }}>Put in editor</Button>
          </>
        : <>
            <Button className="flex-1" disabled={busy} onClick={() => void useTheirs()}>Use theirs</Button>
            <Button kind="primary" className="flex-1" disabled={busy || theirs === null} onClick={() => void keep()}>
              Save mine</Button>
          </>}>
      <p className="mb-3 text-sm text-dim">
        {compare.kind === 'draft'
          ? 'Green is what you had typed earlier. Reject a change to leave it out.'
          : `Red is ${clusterName}'s version, green is yours. Reject a change to take theirs for that part, then save.`}
      </p>
      {problem && <p className="mb-3 text-sm text-bad">{problem}</p>}
      {theirs === null && !problem && <p className="text-sm text-dim">Getting the file from {clusterName}</p>}
      {theirs !== null && (
        <Diff original={theirs} proposed={mine} extensions={ext} handle={handle} className="rounded-xl" />
      )}
      {compare.kind === 'cluster' && (
        <button className="mt-4 h-11 text-sm font-semibold text-accent-text"
          onClick={() => void copyText(mine).then((ok) => toast(ok ? 'Your version is copied' : "Couldn't copy"))}>
          Copy my version</button>
      )}
    </Sheet>
  )
}
