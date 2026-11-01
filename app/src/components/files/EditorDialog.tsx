// Edit a text file that lives on a cluster. Save (or Ctrl+S) writes it back; closing with edits asks first.
import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { FileData } from '../../types/files'
import { useToast } from '../toast'
import { Button, Dialog, Spinner } from '../ui'
import { basename, EDIT_LIMIT } from './format'

export function EditorDialog({ cluster, clusterName, path, onClose }:
  { cluster: string; clusterName: string; path: string; onClose: () => void }) {
  const toast = useToast()
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [asking, setAsking] = useState(false)
  const name = basename(path)

  useEffect(() => {
    call<FileData>('files.read', { cluster, path, limit: EDIT_LIMIT })
      .then((d) => {
        if (d.kind !== 'text') setError('This is not a text file.')
        else if (d.cut) setError('Too big to edit here.')
        else setText(d.text ?? '')
      })
      .catch((e: Error) => setError(e.message))
  }, [cluster, path])

  const save = async (then?: () => void) => {
    if (text === null || saving) return
    setSaving(true)
    try {
      await call('files.write', { cluster, path, text })
      setDirty(false)
      toast(`Saved ${name}`)
      then?.()
    } catch (e) {
      toast(`Could not save: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  const close = () => { if (asking) return; if (dirty) setAsking(true); else onClose() }

  return (
    <>
      <Dialog title={`${name}${dirty ? ' •' : ''}`} onClose={close} width={860}
        actions={<>
          <span className="mr-auto self-center truncate text-sm text-dim">{clusterName}: {path}</span>
          <Button onClick={close}>Close</Button>
          <Button kind="suggested" disabled={!dirty || saving} onClick={() => save()}>
            {saving && <Spinner size={14} />} Save</Button>
        </>}>
        {error ? <p className="py-10 text-center text-bad">{error}</p>
          : text === null ? <div className="grid h-[60vh] place-items-center"><Spinner size={24} /></div>
          : <textarea autoFocus spellCheck={false} value={text}
              onChange={(e) => { setText(e.target.value); setDirty(true) }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save() }
                if (e.key === 'Tab') {  // two spaces, like the GTK editor
                  e.preventDefault()
                  const t = e.currentTarget, a = t.selectionStart
                  t.setRangeText('  ', a, t.selectionEnd, 'end')
                  setText(t.value)
                  setDirty(true)
                }
              }}
              className="mt-1 h-[60vh] w-full resize-none rounded-lg bg-view p-3 font-mono text-sm leading-5
                select-text outline-none ring-1 ring-line focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus" />}
      </Dialog>
      {asking && (
        <Dialog title={`Save changes to ${name}?`} onClose={() => setAsking(false)} width={420}
          actions={<>
            <Button onClick={() => setAsking(false)}>Keep editing</Button>
            <Button kind="destructive" onClick={onClose}>Discard</Button>
            <Button kind="suggested" onClick={() => { setAsking(false); save(onClose) }}>Save</Button>
          </>}>
          <p className="text-center text-dim">Your edits are not saved on the cluster yet.</p>
        </Dialog>
      )}
    </>
  )
}
