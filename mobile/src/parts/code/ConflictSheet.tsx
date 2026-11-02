// A file that changed on the cluster while you edited it. A save that finds it asks first: Compare, Use the
// cluster's, or Save mine (the desktop's words). Compare shows both versions as one diff you settle change by change;
// it also compares a draft from earlier with what is open now. What you keep from the diff is what gets saved.
import { Copy } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Diff, type DiffHandle } from '@shared/components/code/Diff'
import { reloadFile, replaceText, saveFile, type OpenFile } from '@shared/components/code/store'
import { copyText } from '@shared/components/terminals/xterm'
import { call } from '@shared/rpc'
import type { OpenedFile } from '@shared/types/code'
import { BottomSheet, Button, Sheet, useToast } from '../../ui'
import { languageFor } from './util'

export type Compare =
  | { kind: 'cluster'; file: OpenFile }                // yours vs the cluster's now
  | { kind: 'draft'; file: OpenFile; draft: string }   // the open text vs edits kept from earlier

type Props = { compare: Compare; clusterName: string; onDone: (msg?: string) => void }

/** A save found a newer file on the cluster: what to do about it. The dimmed part and Back keep editing. */
export function ConflictChoice({ file, clusterName, onCompare, onDone }:
  { file: OpenFile; clusterName: string; onCompare: () => void; onDone: (msg?: string) => void }) {
  const [problem, setProblem] = useState('')
  async function saveMine() {
    const r = await saveFile(file.key, true)
    if (r.saved) onDone('Saved')
    else setProblem(r.conflict ? 'It changed again. Try once more.' : r.error)
  }
  return (
    <BottomSheet onClose={() => onDone()}>
      <h2 className="text-lg font-semibold">{file.name} changed on {clusterName} while you were editing</h2>
      {problem && <p className="pt-1 text-bad">{problem}</p>}
      <div className="mt-5 flex flex-col gap-3">
        <Button kind="primary" onClick={onCompare}>Compare</Button>
        <Button onClick={() => void reloadFile(file.key, false).then(() => onDone(`Using the version on ${clusterName}`))}>
          Use the cluster's</Button>
        <Button onClick={() => void saveMine()}>Save mine</Button>
      </div>
    </BottomSheet>
  )
}

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
    <Sheet title={compare.kind === 'draft' ? 'Your earlier edits' : `Compare ${f.name}`} onClose={() => onDone()}
      actions={compare.kind === 'draft'
        ? <>
            <Button className="flex-1" onClick={() => onDone()}>Not now</Button>
            <Button kind="primary" className="flex-1" disabled={theirs === null}
              onClick={() => { replaceText(f.key, result()); onDone('In the editor. Save when ready.') }}>Put in editor</Button>
          </>
        : <>
            <Button className="flex-1" disabled={busy} onClick={() => void useTheirs()}>Use the cluster's</Button>
            <Button kind="primary" className="flex-1" disabled={busy || theirs === null} onClick={() => void keep()}>
              Save mine</Button>
          </>}>
      <p className="mb-3 text-sm text-dim">
        {compare.kind === 'draft'
          ? 'Green is what you typed earlier. Reject a change to leave it out.'
          : `Red is on ${clusterName}, green is yours. Reject a change to keep ${clusterName}'s.`}
      </p>
      {problem && <p className="mb-3 text-sm text-bad">{problem}</p>}
      {theirs === null && !problem && <p className="text-sm text-dim">Getting the file from {clusterName}</p>}
      {theirs !== null && (
        <Diff original={theirs} proposed={mine} extensions={ext} handle={handle} className="rounded-[10px]" />
      )}
      {compare.kind === 'cluster' && (
        <Button icon={Copy} className="mt-4"
          onClick={() => void copyText(mine).then((ok) => toast(ok ? 'Your version is copied' : "Couldn't copy"))}>
          Copy my version</Button>
      )}
    </Sheet>
  )
}
