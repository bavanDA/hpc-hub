import { Circle, Copy, RotateCcw, Undo2 } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import type { Changes, SavedVersion } from '../../../../types/history'
import { Button } from '../../../ui/Button'
import { useToast } from '../../../useToast'
import { fileName, lastLine, plural, when } from '../format'
import { git } from '../git'

import type { DetailProps } from './Detail'

export function SavedHead(p: DetailProps & { version: SavedVersion; changes: Changes | null; switcher: ReactNode
  onRestored: () => void }) {
  const { version, where } = p
  const toast = useToast()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const files = p.changes?.files ?? []
  const copy = async () => {
    const path = files[0]?.path ?? version.files[0]
    if (!path) return
    try {
      const { text } = await git<{ text: string }>('file', where, { at: version.hash, path })
      await navigator.clipboard.writeText(text)
      toast(`Copied ${fileName(path)} as it was at ${when(version.time, true)}`)
    } catch (e) { toast(lastLine((e as Error).message), { kind: 'error' }) }
  }
  const restore = async () => {
    setBusy(true)
    try {
      await git('restore', where, { version: version.hash })
      toast('Restored. What you had is a saved version now.')
      setAsking(false)
      p.onRestored()
    } catch (e) { toast(lastLine((e as Error).message), { kind: 'error' }) } finally { setBusy(false) }
  }
  const at = when(version.time, true)
  return (
    <div className="relative shrink-0 border-b border-line px-6 pt-4 pb-3">
      <div className="flex items-center gap-2">
        <Circle size={14} className="text-dim" />
        <h2 className="min-w-0 flex-1 text-xl font-semibold">Saved version, {at}</h2>
        <Button size="sm" onClick={copy}><Copy size={14} /> Copy text</Button>
        <Button size="sm" onClick={() => setAsking(true)}><RotateCcw size={14} /> Restore this version</Button>
        {p.switcher}
      </div>
      <p className="mt-1 text-dim">{version.kind === 'Saved' || version.kind === 'Compiled' ? 'Saved automatically.'
        : `${version.kind}.`} Not a commit, never pushed with your work. Kept 30 days.</p>
      <p className="mt-1 text-sm text-dim">Comparing with <b className="text-text">Now</b>
        {p.changes && <> · {files.length ? `${files.map((f) => fileName(f.path)).slice(0, 3).join(', ')}, ${plural(
          p.changes.added + p.changes.removed, 'line')} differ` : 'the same as now'}</>}</p>
      {asking && (
        <div className="dialog-in absolute top-14 right-6 z-20 w-[380px] rounded-xl border border-line bg-raised p-4 shadow-xl">
          <div className="font-semibold">Restore the paper as it was at {at}?</div>
          <p className="mt-1 text-sm text-dim">Your files go back to this version. What you have now is saved as a version
            first, so you can come back to it. Nothing is committed.</p>
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" onClick={() => setAsking(false)}>Cancel</Button>
            <Button size="sm" kind="primary" disabled={busy} onClick={restore}><Undo2 size={14} /> Restore</Button>
          </div>
        </div>
      )}
    </div>
  )
}
