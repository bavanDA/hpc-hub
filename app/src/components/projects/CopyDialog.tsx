import { FolderOpen } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import { useEvent } from '../../hooks'
import { call } from '../../rpc'
import type { CopyPlan, CopyTargets, Place, Places, Project } from '../../types/projects'
import { shortName } from '../clusters/loginCopy'
import { useAskForNode } from '../clusters/AskForNode'
import { CheckRow, ChoiceRow } from '../e/extra'
import { EDialog, Field, List, MainButton, Segments, ToggleRow } from '../e/ui'
import { Spinner } from '../ui'
import { startFolder } from './copyInto'
import { FolderPicker } from './FolderPicker'
import { formatSize } from './size'

type How = 'laptop' | 'globus'
const BIG = 5 * 1024 ** 3

const inside = (into: string, path: string) => into === path || into.startsWith(path.replace(/\/+$/, '') + '/')

/** A titled part of the window: a small grey title over its rows. */
function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pt-5">
      <h3 className="px-5 pb-1.5 text-xs font-semibold tracking-wide text-dim uppercase">{title}</h3>
      {children}
    </section>
  )
}

const NOTE = 'px-5 pt-2 text-sm text-dim'

export function CopyDialog({ p, onClose, onStarted }:
  { p: Project; onClose: () => void; onStarted: (ids: string[], text: string) => void }) {
  const [info, setInfo] = useState<CopyTargets | null>(null)
  const [plan, setPlan] = useState<CopyPlan | null>(null)
  const [planError, setPlanError] = useState('')
  const [to, setTo] = useState('')
  const [into, setInto] = useState<string | null>(null)  // null: startFolder's pick
  const [how, setHow] = useState<How>('laptop')
  const [keep, setKeep] = useState<Record<string, boolean>>({})
  const [chats, setChats] = useState<Record<string, boolean>>({})
  const [found, setFound] = useState<{ cluster: string; storage: Place[] }>({ cluster: '', storage: [] })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)

  useEffect(() => {
    call<CopyTargets>('projects.copy_targets', { id: p.id }).then((t) => {
      const dst = t.targets.find((x) => x.id === t.copy_to) ?? t.targets.find((x) => !x.same) ?? t.targets[0]
      setInfo(t)
      setTo(dst?.id ?? '')
      setHow(dst && !dst.globus_missing ? 'globus' : 'laptop')  // faster, and copying again only sends changes
    }).catch((e: Error) => setError(e.message))
    call<CopyPlan>('projects.copy_plan', { id: p.id }).then((got) => {
      setPlan(got)
      setKeep(Object.fromEntries(got.parts.map((x) => [x.name, x.keep])))
    }).catch((e: Error) => setPlanError(e.message))
  }, [p.id])

  useEvent<{ id: string; connected: boolean }>('session', (s) => setInfo((t) => t && {
    ...t, targets: t.targets.map((x) => x.id === s.id ? { ...x, connected: s.connected } : x) }))

  const dst = info?.targets.find((x) => x.id === to)
  useEffect(() => {
    if (!dst?.connected) return
    const cluster = dst.id
    call<Places>('projects.places', { cluster }).then((pl) => setFound({ cluster, storage: pl.storage }))
      .catch(() => {})
  }, [dst?.id, dst?.connected])

  const spots = dst?.connected && found.cluster === dst.id ? found.storage : []
  const intoPath = (into ?? (info ? startFolder(p, info, dst, spots) : '~')).trim() || '~'
  const spot = spots.filter((s) => inside(intoPath, s.path)).sort((a, b) => b.path.length - a.path.length)[0]
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

  let what = 'Measuring sizes'
  if (planError || plan?.parts_error) what = `Could not measure it: ${planError || plan?.parts_error}`
  else if (plan) what = 'Untick what stays behind.'
  const allChats = picked.length > 0 && picked.length === plan?.chats.length

  return (
    <>
      <EDialog title={`Copy or sync ${p.name}`} width={580} onClose={picking ? () => {} : onClose}
        actions={info && info.targets.length > 0 && <MainButton disabled={!dst || !!missing || busy} onClick={go}>
          {busy && <Spinner size={16} />}{sync ? 'Sync' : 'Copy'}{plan ? ` ${formatSize(files)}` : ''}</MainButton>}>
        {!info ? <div className="grid h-40 place-items-center">
            {error ? <p className="text-bad">{error}</p> : <Spinner size={24} />}</div>
          : (
          <>
            <List>
              <ChoiceRow label="To" value={to} onChange={(v) => {
                setTo(v)
                setInto(null)
                setError('')
                if (info.targets.find((t) => t.id === v)?.globus_missing) setHow('laptop')
              }} options={info.targets.map((t) => ({ value: t.id,
                label: t.same ? `${shortName(t)}, another folder` : shortName(t),
                hint: t.same ? 'Like another group\'s Project' : t.connected ? 'Connected' : 'Not connected' }))} />
            </List>
            <div className="px-5 pt-3">
              {dst && !dst.connected
                ? <p className="text-sm text-dim">Connect to {dstName} on Clusters to choose Home, Project or Scratch.</p>
                : spots.length > 0 ? <Segments label="Into" value={spot?.label ?? ''}
                    options={spots.map((s) => [s.label, s.label] as const)}
                    onChange={(label) => {
                      const s = spots.find((x) => x.label === label)
                      if (s && !inside(intoPath, s.path)) setInto(s.path)
                    }} />
                  : <Spinner />}
              {spot?.label.startsWith('Scratch') && (
                <p className="pt-2 text-sm text-dim">Scratch gets cleaned up. Keep work you need in Project.</p>
              )}
              <div className="flex items-end gap-2 pt-1">
                <div className="min-w-0 flex-1"><Field label="Into folder" value={into ?? intoPath}
                  onChange={(e) => setInto(e.target.value)} /></div>
                <button aria-label="Choose a folder" title="Choose a folder"
                  onClick={() => dst?.connected ? setPicking(true) : setError(`Connect to ${dstName} first`)}
                  className="mb-1.5 grid size-10 shrink-0 place-items-center rounded-lg border border-line-strong
                    hover:bg-hover active:bg-pressed"><FolderOpen size={18} className="text-dim" /></button>
              </div>
              <p className="text-sm text-dim">Lands in <span className="font-mono break-all">
                {intoPath.replace(/\/+$/, '')}/{info.name}</span></p>
            </div>

            {same ? <p className={NOTE}>{dstName} copies it from folder to folder itself. Copying again only sends
              what changed, and the files count for the group whose folder they land in.</p> : <Step title="How">
              <div className="px-5">
                <Segments label="How" value={how} onChange={setHow}
                  options={[['globus', 'Globus'], ['laptop', 'Through this laptop']] as const} />
              </div>
              <p className={NOTE}>
                {sync ? 'Cluster to cluster, for big projects. Copying again only sends what changed.'
                  : 'Simple, fine for smaller projects.'}
                {!sync && files > BIG && ' That is big: Globus is much faster.'}</p>
              {missing && <p className={`${NOTE} text-bad`}>Globus needs {missing} first. Set it up in Files, Transfers.</p>}
            </Step>}

            <Step title="What to take">
              <List>
                {plan?.parts.map((x) => (
                  <CheckRow key={x.name} label={x.name} value={formatSize(x.size)} checked={!!keep[x.name]}
                    onChange={(v) => setKeep({ ...keep, [x.name]: v })} />
                ))}
              </List>
              <p className={NOTE}>{what}</p>
            </Step>

            {plan && (plan.chats.length > 0 || plan.chats_error) && (
              <Step title="Claude chats">
                <List>
                  {plan.chats.length > 1 && <ToggleRow label="All of them" checked={allChats}
                    onChange={(on) => setChats(Object.fromEntries(plan.chats.map((c) => [c.id, on])))} />}
                  {plan.chats.map((c) => (
                    <CheckRow key={c.id} label={c.name} value={formatSize(c.size)} checked={!!chats[c.id]}
                      onChange={(v) => setChats({ ...chats, [c.id]: v })} />
                  ))}
                </List>
                <p className={NOTE}>{plan.chats_error ? `Could not read chats: ${plan.chats_error}`
                  : 'Tick the ones to keep going there.'}</p>
              </Step>
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
