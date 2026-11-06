import type { Extension } from '@codemirror/state'
import { FilePlus2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import { call } from '../../rpc'
import type { ProposedFile } from '../../types/code'
import { AGENT_NAMES as AGENTS } from './ask'
import { PRIMARY, SECONDARY } from './buttons'
import { Diff, type DiffHandle } from './Diff'
import { fileKey, getFile, isDirty, openFile, replaceText, saveFile, useCode } from './store'

/** One file an agent wants to change, to accept or reject piece by piece, then put in the editor or save. */
export function ProposedFileView({ cluster, file, agent, languageFor, onOpenFile }:
  { cluster: string; file: ProposedFile; agent: string; languageFor?: (path: string) => Extension[]
    onOpenFile?: (cluster: string, path: string) => void }) {
  const extensions = useMemo(() => languageFor?.(file.path), [languageFor, file.path])
  useCode()  // redraw when the open file changes (you kept typing)
  const key = fileKey(cluster, file.path)
  const open = getFile(key)
  // compare against what you have now: your edits since the ask count, not the agent's old snapshot
  const base = open && !open.loading ? open.text : file.original
  const changedSince = Boolean(open && !open.loading && (open.sha !== file.base_sha || isDirty(open)) && !file.is_new)
  const handle = useRef<DiffHandle | null>(null)
  const [left, setLeft] = useState(0)
  const [state, setState] = useState<'' | 'busy' | 'saved' | 'applied'>('')
  const [problem, setProblem] = useState('')
  const name = file.path.split('/').pop()
  const who = AGENTS[agent] ?? 'The agent'

  async function apply(save: boolean) {
    const text = handle.current?.text() ?? file.proposed
    setState('busy')
    setProblem('')
    try {
      if (file.is_new) {
        await call('code.new_file', { cluster, path: file.path, text })
        await openFile(cluster, file.path)
        setState('saved')
      } else {
        if (!getFile(key)) await openFile(cluster, file.path)
        replaceText(key, text)
        if (!save) {
          setState('applied')
          return
        }
        const r = await saveFile(key)
        if (r.saved) setState('saved')
        else {
          setState('applied')
          setProblem(r.conflict ? `${name} changed on the cluster. It's in the editor, not saved.` : r.error)
        }
      }
      onOpenFile?.(cluster, file.path)
    } catch (e) {
      setState('')
      setProblem((e as Error).message)
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {file.is_new && <FilePlus2 size={16} className="text-accent-text" />}
        <p className="min-w-0 flex-1 truncate font-semibold">
          {file.is_new ? `New file ${file.path}` : `${who} suggests ${left === 1 ? 'a change' : `${left} changes`} to ${name}`}
        </p>
      </div>
      {changedSince && <p className="text-sm text-dim">You changed {name} since you asked. This compares with your version.</p>}
      <Diff original={base} proposed={file.proposed} isNew={file.is_new} extensions={extensions} handle={handle}
        onChange={(_t, n) => setLeft(n)} />
      {state === 'saved' && <p className="text-sm text-ok">Saved on the cluster.</p>}
      {state === 'applied' && !problem && <p className="text-sm text-dim">In the editor. Save when you're ready.</p>}
      {problem && <p className="text-sm text-bad">{problem}</p>}
      {state !== 'saved' && (
        <div className="flex flex-wrap gap-2">
          {!file.is_new && (
            <>
              <button type="button" className={SECONDARY} disabled={state === 'busy' || left === 0}
                onClick={() => handle.current?.rejectAll()}>Reject all</button>
              <button type="button" className={SECONDARY} disabled={state === 'busy'}
                onClick={() => void apply(false)}>Put in editor</button>
            </>
          )}
          <button type="button" className={PRIMARY} disabled={state === 'busy'} onClick={() => void apply(true)}>
            {file.is_new ? 'Add file' : left > 0 ? 'Accept and save' : 'Save'}
          </button>
        </div>
      )}
    </section>
  )
}
