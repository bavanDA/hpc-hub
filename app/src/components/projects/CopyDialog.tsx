import { useState } from 'react'

import { call } from '../../rpc'
import type { Project } from '../../types/projects'
import { useAskForNode } from '../clusters/AskForNode'
import { shortName } from '../clusters/loginCopy'
import { EDialog } from '../e/EDialog'
import { MainButton } from '../e/MainButton'
import { size } from '../files/format'
import { ReportLink } from '../report/ReportLink'
import { Spinner } from '../ui/Spinner'
import { CopyChats } from './CopyChats'
import { CopyHow } from './CopyHow'
import { spotFor, startFolder } from './copyInto'
import { CopyParts } from './CopyParts'
import { measureNote } from './copyPlan'
import { CopyWhere } from './CopyWhere'
import { FolderPicker } from './FolderPicker'
import { useCopyInfo } from './useCopyInfo'
import { useStoragePlaces } from './useStoragePlaces'

export function CopyDialog({ p, onClose, onStarted }:
  { p: Project; onClose: () => void; onStarted: (ids: string[], text: string) => void }) {
  const { info, plan, planError, to, setTo, how, setHow, keep, setKeep, error, setError } = useCopyInfo(p.id)
  const [into, setInto] = useState<string | null>(null)  // null: startFolder's pick
  const [chats, setChats] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)

  const dst = info?.targets.find((x) => x.id === to)
  const spots = useStoragePlaces(dst)
  const intoPath = (into ?? (info ? startFolder(p, info, dst, spots) : '~')).trim() || '~'
  const missing = how === 'globus' && !dst?.same ? dst?.globus_missing ?? '' : ''
  const files = (plan?.parts ?? []).filter((x) => keep[x.name]).reduce((n, x) => n + x.size, 0)
  const picked = (plan?.chats ?? []).filter((c) => chats[c.id])
  const same = !!dst?.same
  const sync = how === 'globus' && !same
  const dstName = dst ? shortName(dst) : ''

  const nodeFirst = useAskForNode()
  const start = () => {
    if (!dst) return
    if (!dst.connected) return setError(`Connect to ${dstName} first`)
    setBusy(true)
    call<{ id: string; chats: string }>('projects.copy', {
      id: p.id, to: dst.id, into: intoPath, how, size: files,
      skip: (plan?.parts ?? []).filter((x) => !keep[x.name]).map((x) => x.name), chats: picked.map((c) => c.id),
    }).then((r) => {
      const where = same ? intoPath : dstName
      onStarted([r.id, r.chats].filter(Boolean), `${sync ? 'Syncing' : 'Copying'} ${p.name} to ${where}`)
      onClose()
    }).catch((e: Error) => { setError(e.message); setBusy(false) })
  }
  // on its own cluster the copy runs there, on your compute node: never on the login node
  const go = () => (dst?.same ? nodeFirst.guard(dst.id, 'The copy', start) : start())

  const pickTarget = (id: string) => {
    setTo(id)
    setInto(null)
    setError('')
    if (info?.targets.find((t) => t.id === id)?.globus_missing) setHow('laptop')
  }

  return (
    <>
      <EDialog title={`Copy or sync ${p.name}`} width={580} onClose={picking ? () => {} : onClose}
        actions={info && info.targets.length > 0 && <MainButton disabled={!dst || !!missing || busy} onClick={go}>
          {busy && <Spinner size={16} />}{sync ? 'Sync' : 'Copy'}{plan ? ` ${size(files)}` : ''}</MainButton>}>
        {!info ? <div className="grid h-40 place-items-center">
            {error ? <p className="text-bad">{error} <ReportLink className="ml-1" error={error} /></p> : <Spinner size={24} />}</div>
          : (
          <>
            <CopyWhere info={info} to={to} onTo={pickTarget} dst={dst} spots={spots} spot={spotFor(intoPath, spots)}
              into={into} intoPath={intoPath} onInto={setInto}
              onBrowse={() => dst?.connected ? setPicking(true) : setError(`Connect to ${dstName} first`)} />
            <CopyHow dstName={dstName} same={same} how={how} onHow={setHow} files={files} missing={missing} />
            <CopyParts plan={plan} keep={keep} onKeep={setKeep} note={measureNote(planError, plan)} />
            {plan && (plan.chats.length > 0 || plan.chats_error) && (
              <CopyChats plan={plan} chats={chats} onChats={setChats} />
            )}
            {error && <p className="px-5 pt-4 select-text text-bad">{error}</p>}
          </>
        )}
      </EDialog>
      {nodeFirst.dialog}
      {picking && dst && (
        <FolderPicker cluster={dst} start={intoPath} onPick={setInto} onClose={() => setPicking(false)} />
      )}
    </>
  )
}
