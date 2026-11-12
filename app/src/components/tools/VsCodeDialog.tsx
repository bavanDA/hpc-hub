// VS Code: a batch job of its own runs a tunnel on a compute node; the folder opens in the VS Code app or the
// browser. One VS Code job at a time: with one running, this shows how far it got (in the queue, starting, the
// GitHub code to type, VS Code installing on the node, running) instead of a form, and you open it or stop it.
// Without one, you pick the folder and the node and start it. Each step, and anything that goes wrong, stays on
// screen.
import { FolderOpen } from 'lucide-react'
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'

import { call } from '../../rpc'
import type { Target, ToolSetup, VsFound } from '../../types/tools'
import { shortName } from '../clusters/loginCopy'
import { NodeFields } from '../clusters/node/NodeFields'
import { EDialog } from '../e/EDialog'
import { Field } from '../e/Field'
import { MainButton } from '../e/MainButton'
import { Segments } from '../e/Segments'
import { ToggleRow } from '../e/ToggleRow'
import { FolderPicker } from '../projects/FolderPicker'
import { Spinner } from '../ui/Spinner'
import { useToast } from '../useToast'
import { sendable } from './format'
import { forgetWatch, getWatch, onWatch, startVscode, type VsWatch } from './run'
import { ASK_VS, ASK_VS_SUB } from './vscodeWords'
import { Problem, Progress } from './VsCodeProgress'

const TARGETS = [['desktop', 'VS Code app'], ['browser', 'Browser']] as const

function useWatch(cluster: string): VsWatch | null {
  const subscribe = useCallback((fn: () => void) => onWatch(cluster, fn), [cluster])
  return useSyncExternalStore(subscribe, () => getWatch(cluster))
}

/** start: the folder asked for (a project's), wanted: app or browser from the menu. go: Ask every time is off,
 *  so a new job starts at once with the saved choices (the steps still show). */
export function VsCodeDialog({ cluster, name, folder: start = '', target: wanted, go: straight = false, onClose,
  onBack }: { cluster: string; name: string; folder?: string; target?: Target; go?: boolean; onClose: () => void
  onBack?: () => void }) {
  const toast = useToast()
  const w = useWatch(cluster)
  const [setup, setSetup] = useState<ToolSetup | null>(null)
  const [looking, setLooking] = useState(true)
  const [error, setError] = useState('')
  const label = shortName({ name })

  // the job you have opens this folder (the backend expands ~, and opens it now if its tunnel is up); without
  // one, the form, or with Ask every time off a new job with the saved choices
  useEffect(() => {
    let live = true
    const known = getWatch(cluster)
    if (known?.status?.phase === 'ended') forgetWatch(cluster)  // said already; now you can start a new one
    const watching = known && known.status?.phase !== 'ended' ? known.job : ''
    Promise.all([call<ToolSetup>('tools.setup', { cluster }),
      watching ? Promise.resolve(null) : call<VsFound>('tools.vscode_find', { cluster })])
      .then(async ([s, found]) => {
        if (!live) return
        setSetup(s)
        const job = watching || found?.job?.id || ''
        if (job || straight) {
          await startVscode(cluster, name, { folder: start || s.vscode.workdir || '~',
            target: wanted ?? s.vscode.open_in, job, replace_job: false, profile: null, remember: false,
            remember_folder: false }, s.vscode.open_links)
        }
      })
      .catch((e: Error) => live && setError(`Could not start VS Code: ${e.message}`))
      .finally(() => live && setLooking(false))
    return () => { live = false }
  }, [cluster, name, start, wanted, straight])

  const close = useCallback(() => {
    const phase = getWatch(cluster)?.status?.phase
    if (phase && phase !== 'ended' && phase !== 'ready') {
      toast(`VS Code keeps starting on ${label}. It opens by itself when it's ready.`)
    }
    onClose()
  }, [cluster, label, onClose, toast])

  let body: ReactNode = null
  if (w) body = <Progress w={w} onNew={() => forgetWatch(cluster)} onClose={close} />
  else if (looking) body = <Looking name={label} />
  else if (setup) body = <Start setup={setup} start={start} wanted={wanted} onError={setError} />

  return (
    <EDialog title={`VS Code on ${label}`} onClose={close} onBack={onBack}>
      {error && <Problem text={error} />}
      {body}
    </EDialog>
  )
}

function Looking({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-10 text-center text-dim">
      <Spinner size={28} />
      <p>Looking for your VS Code job on {name}…</p>
    </div>
  )
}

function Start({ setup, start, wanted, onError }:
  { setup: ToolSetup; start: string; wanted?: Target; onError: (text: string) => void }) {
  const v = setup.vscode
  const [folder, setFolder] = useState(start || v.workdir || '~')
  const [target, setTarget] = useState<Target>(wanted ?? v.open_in ?? 'desktop')
  const [profile, setProfile] = useState(v.profile)
  const [remember, setRemember] = useState(true)
  const [ask, setAsk] = useState(v.ask ?? true)
  const [picking, setPicking] = useState(false)
  const [fits, setFits] = useState(true)
  const [sending, setSending] = useState(false)

  async function go() {
    setSending(true)
    onError('')
    try {
      await startVscode(setup.id, setup.name, { folder: folder.trim() || '~', target, job: '', replace_job: false,
        profile: sendable(profile), remember, remember_folder: !start, ask }, v.open_links)
    } catch (e) {
      onError(`The VS Code job was not submitted: ${(e as Error).message}`)
      setSending(false)
    }
  }

  return <>
    <div className="flex flex-col gap-3 px-5">
      <p className="text-sm text-dim">VS Code runs on a compute node as a job of its own, and opens here.</p>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Field label="Folder" value={folder === '~' ? '' : folder} placeholder="Home folder"
            onChange={(e) => setFolder(e.target.value || '~')} />
        </div>
        <button aria-label="Choose a folder" title="Choose a folder" onClick={() => setPicking(true)}
          className="mb-1.5 grid size-10 shrink-0 place-items-center rounded-lg border border-line-strong
            hover:bg-hover active:bg-pressed"><FolderOpen size={18} className="text-dim" /></button>
      </div>
      <div>
        <p className="mb-1.5 text-sm text-dim">Open in</p>
        <Segments label="Open in" value={target} onChange={setTarget} options={TARGETS} />
      </div>
    </div>
    <section className="pt-5">
      <h3 className="px-5 pb-2.5 text-xs font-semibold tracking-wide text-dim uppercase">Compute node</h3>
      <NodeFields cluster={setup.id} value={profile} onChange={setProfile} onValid={setFits} now />
      <ToggleRow label="Use these next time" checked={remember} onChange={setRemember} />
      <ToggleRow label={ASK_VS} sub={ASK_VS_SUB} checked={ask} onChange={setAsk} />
    </section>
    <div className="px-5 pt-4 pb-3">
      <MainButton disabled={sending || !fits} onClick={go}>
        {sending ? <><Spinner /> Submitting…</> : 'Start VS Code'}</MainButton>
    </div>
    {picking && <FolderPicker cluster={{ id: setup.id, name: setup.name, connected: true }}
      start={folder.trim() || '~'} onPick={setFolder} onClose={() => setPicking(false)} />}
  </>
}
