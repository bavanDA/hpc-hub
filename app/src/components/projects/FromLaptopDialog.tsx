// A project from this computer to a cluster, with its Claude chats. HPC Hub reads only the folder you pick and
// that folder's own chats (hpc_hub/projects/from_laptop.py), and copies only what stays ticked.
import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { CopyPlan, CopyTarget, CopyTargets, ProjectCluster } from '../../types/projects'
import { inTauri } from '../app/platform'
import { shortName } from '../clusters/loginCopy'
import { EDialog } from '../e/EDialog'
import { MainButton } from '../e/MainButton'
import { size } from '../files/format'
import { Spinner } from '../ui/Spinner'
import { CopyChats } from './CopyChats'
import { CopyParts } from './CopyParts'
import { CopyStep } from './CopyStep'
import { CopyWhere } from './CopyWhere'
import { FolderPicker } from './FolderPicker'
import { NOTE } from './noteClass'
import { useStoragePlaces } from './useStoragePlaces'

type LocalPlan = CopyPlan & { name: string; folder: string }

async function pickLocalFolder(): Promise<string | null> {
  if (!inTauri) return '/home/jdoe/research/thesis'  // design preview
  const { open } = await import('@tauri-apps/plugin-dialog')
  const picked = await open({ title: 'Choose the project folder on this computer', directory: true })
  return typeof picked === 'string' ? picked : null
}

export function FromLaptopDialog({ clusters, onClose, onStarted }: {
  clusters: ProjectCluster[]; onClose: () => void; onStarted: (ids: string[], text: string) => void
}) {
  const [plan, setPlan] = useState<LocalPlan | null>(null)
  const [keep, setKeep] = useState<Record<string, boolean>>({})
  const [chats, setChats] = useState<Record<string, boolean>>({})
  const [to, setTo] = useState(() => clusters.find((c) => c.connected)?.id ?? clusters[0]?.id ?? '')
  const [into, setInto] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)

  const choose = () => {
    setError('')
    pickLocalFolder().then((folder) => {
      if (!folder) { if (!plan) onClose(); return }
      setPlan(null)
      call<LocalPlan>('projects.local_plan', { folder }).then((p) => {
        setPlan(p)
        setKeep(Object.fromEntries(p.parts.map((x) => [x.name, x.keep])))
        setChats(Object.fromEntries(p.chats.map((c) => [c.id, true])))  // a project moves with its chats
      }).catch((e: Error) => setError(e.message))
    }).catch((e: Error) => setError(e.message))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(choose, [])

  const targets: CopyTarget[] = clusters.map((c) => ({ ...c, globus_missing: '' }))
  const info: CopyTargets = { name: plan?.name ?? '', copy_to: '', copy_into: '', targets }
  const dst = targets.find((t) => t.id === to)
  const spots = useStoragePlaces(dst)
  const project = spots.find((s) => s.label.startsWith('Project'))
  const intoPath = (into ?? project?.path ?? '~').trim() || '~'
  const files = (plan?.parts ?? []).filter((x) => keep[x.name]).reduce((n, x) => n + x.size, 0)
  const picked = (plan?.chats ?? []).filter((c) => chats[c.id])
  const dstName = dst ? shortName(dst) : ''

  const start = () => {
    if (!plan || !dst) return
    if (!dst.connected) return setError(`Connect to ${dstName} first`)
    setBusy(true)
    call<{ id: string; chats: string }>('projects.local_copy', {
      folder: plan.folder, to: dst.id, into: intoPath,
      skip: plan.parts.filter((x) => !keep[x.name]).map((x) => x.name), chats: picked.map((c) => c.id),
    }).then((r) => {
      onStarted([r.id, r.chats].filter(Boolean), `Copying ${plan.name} from this computer to ${dstName}`)
      onClose()
    }).catch((e: Error) => { setError(e.message); setBusy(false) })
  }

  return (
    <>
      <EDialog title="Project from this computer" width={580} onClose={picking ? () => {} : onClose}
        actions={plan && <MainButton disabled={!dst || busy} onClick={start}>
          {busy && <Spinner size={16} />}Copy {size(files)}{picked.length ? ` and ${picked.length} chats` : ''}
        </MainButton>}>
        {!plan ? <div className="grid h-40 place-items-center px-5 text-center">
            {error ? <p className="text-bad">{error}</p> : <Spinner size={24} />}</div> : (
          <>
            <CopyStep title="From this computer">
              <div className="flex items-center gap-3 px-5">
                <span className="min-w-0 flex-1 font-mono text-sm break-all">{plan.folder}</span>
                <button onClick={choose} className="shrink-0 text-sm font-semibold underline underline-offset-2">
                  Choose another</button>
              </div>
              <p className={NOTE}>HPC Hub reads only this folder and the Claude chats started in it.</p>
            </CopyStep>
            <div className="pt-5">
              <CopyWhere info={info} to={to} onTo={(id) => { setTo(id); setInto(null); setError('') }} dst={dst}
                spots={spots} spot={spots.find((s) => intoPath === s.path || intoPath.startsWith(`${s.path}/`))}
                into={into} intoPath={intoPath} onInto={setInto}
                onBrowse={() => dst?.connected ? setPicking(true) : setError(`Connect to ${dstName} first`)} />
            </div>
            <CopyParts plan={plan} keep={keep} onKeep={setKeep}
              note={plan.parts_error ? `Could not measure it: ${plan.parts_error}`
                : 'Untick what you can make again on the cluster, like outputs or environments.'} />
            {(plan.chats.length > 0 || plan.chats_error) && (
              <CopyChats plan={plan} chats={chats} onChats={setChats} />
            )}
            {error && <p className="px-5 pt-4 select-text text-bad">{error}</p>}
          </>
        )}
      </EDialog>
      {picking && dst && (
        <FolderPicker cluster={dst} start={intoPath} onPick={setInto} onClose={() => setPicking(false)} />
      )}
    </>
  )
}
