// Copy or sync a project to another cluster: where it goes, how (Globus cluster to cluster, or through this phone),
// what to leave behind, and which Claude chats come along. Same calls as the desktop's CopyDialog.
import { Check } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import { formatSize } from '@shared/components/projects/size'
import { Spinner } from '@shared/components/ui'
import { useEvent } from '@shared/hooks'
import { call } from '@shared/rpc'
import type { CopyPlan, CopyTargets, Place, Places, Project } from '@shared/types/projects'
import { Chips, MainButton, PickerSheet, Row, Segments, Sheet } from '../../ui'
import { shortCluster, wrapPath } from '../code/util'
import { FolderPicker, folderText } from './FolderPicker'

type How = 'globus' | 'phone'
const BIG = 5 * 1024 ** 3

const inside = (into: string, path: string) => into === path || into.startsWith(path.replace(/\/+$/, '') + '/')

/** A titled part of the sheet: a small grey title over its rows. */
function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pt-5">
      <h3 className="px-4 pb-1.5 text-xs font-semibold tracking-wide text-dim uppercase">{title}</h3>
      {children}
    </section>
  )
}

const NOTE = 'px-4 pt-2 text-sm text-dim'

/** A row you tick: name on the left, its size on the right. */
function Tick({ title, size, checked, onChange }:
  { title: string; size: number; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <button role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)}
      className="flex min-h-14 w-full items-center gap-3 border-b border-line px-4 py-2 text-left active:bg-pressed">
      <span className={`grid size-6 shrink-0 place-items-center rounded-md border-2 ${
        checked ? 'border-accent bg-accent text-on-accent' : 'border-line-strong'}`}>{checked && <Check size={16} />}</span>
      <span className="min-w-0 flex-1 break-all">{title}</span>
      <span className="shrink-0 font-medium tabular-nums">{formatSize(size)}</span>
    </button>
  )
}

export function CopySheet({ p, onClose, onStarted }:
  { p: Project; onClose: () => void; onStarted: (ids: string[], text: string) => void }) {
  const [info, setInfo] = useState<CopyTargets | null>(null)
  const [plan, setPlan] = useState<CopyPlan | null>(null)
  const [planError, setPlanError] = useState('')
  const [to, setTo] = useState('')
  const [into, setInto] = useState('~')
  const [how, setHow] = useState<How>('phone')
  const [keep, setKeep] = useState<Record<string, boolean>>({})
  const [chats, setChats] = useState<Record<string, boolean>>({})
  const [found, setFound] = useState<{ cluster: string; storage: Place[] }>({ cluster: '', storage: [] })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<'' | 'to' | 'folder'>('')

  useEffect(() => {
    call<CopyTargets>('projects.copy_targets', { id: p.id }).then((t) => {
      const dst = t.targets.find((x) => x.id === t.copy_to) ?? t.targets[0]
      setInfo(t)
      setTo(dst?.id ?? '')
      setInto(t.copy_into || '~')
      setHow(dst && !dst.globus_missing ? 'globus' : 'phone')  // cluster to cluster: no phone data, no waiting
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

  const intoPath = into.trim() || '~'
  const spots = dst?.connected && found.cluster === dst.id ? found.storage : []
  const spot = spots.filter((s) => inside(intoPath, s.path)).sort((a, b) => b.path.length - a.path.length)[0]
  const missing = how === 'globus' ? dst?.globus_missing ?? '' : ''
  const files = (plan?.parts ?? []).filter((x) => keep[x.name]).reduce((n, x) => n + x.size, 0)
  const picked = (plan?.chats ?? []).filter((c) => chats[c.id])
  const sync = how === 'globus'

  const go = () => {
    if (!dst) return
    if (!dst.connected) return setError(`Connect to ${shortCluster(dst.name)} first`)
    setBusy(true)
    call<{ id: string; chats: string }>('projects.copy', {
      id: p.id, to: dst.id, into: intoPath, how: sync ? 'globus' : 'laptop', size: files,
      skip: (plan?.parts ?? []).filter((x) => !keep[x.name]).map((x) => x.name), chats: picked.map((c) => c.id),
    }).then((r) => {
      onStarted([r.id, r.chats].filter(Boolean), `Copying ${p.name} to ${shortCluster(dst.name)}`)
      onClose()
    }).catch((e: Error) => { setError(e.message); setBusy(false) })
  }

  let what = 'Measuring sizes'
  if (planError || plan?.parts_error) what = `Couldn't measure it: ${planError || plan?.parts_error}`
  else if (plan) what = 'Untick what stays behind.'

  return (
    <>
      <Sheet flush title={`Copy ${p.name}`} onClose={onClose} actions={
        <MainButton disabled={!dst || !!missing || busy} onClick={go}>
          {busy ? <Spinner /> : `Copy${plan ? ` ${formatSize(files)}` : ''}`}</MainButton>}>
        {!info ? <div className="grid h-40 place-items-center">
            {error ? <p className="text-bad">{error}</p> : <Spinner size={24} />}</div>
          : info.targets.length === 0 ? <p className="px-4 py-8 text-center text-dim">Add another cluster first.</p> : (
          <>
            <Step title="Where to">
              <div className="border-t border-line">
                <Row label="Cluster" opens onPress={() => setOpen('to')}
                  value={dst ? (dst.connected ? shortCluster(dst.name) : `${shortCluster(dst.name)}, not connected`) : 'Pick one'} />
                <Row label="Into" opens value={folderText(intoPath)}
                  onPress={() => dst?.connected ? setOpen('folder') : setError(`Connect to ${shortCluster(dst?.name ?? '')} first`)} />
              </div>
              {spots.length > 0 && (
                <div className="px-4 pt-1">
                  <Chips one value={spot ? [spot.label] : []} options={spots.map((s) => [s.label, s.label] as const)}
                    onChange={([label]) => {
                      const s = spots.find((x) => x.label === label)
                      if (s && !inside(intoPath, s.path)) setInto(s.path)
                    }} />
                  {spot?.label.startsWith('Scratch') && (
                    <p className="text-sm text-dim">Scratch gets cleaned up. Keep work you need in Project.</p>
                  )}
                </div>
              )}
              <p className={NOTE}>It lands in <span className="font-mono break-words">
                {wrapPath(`${intoPath.replace(/\/+$/, '')}/${info.name}`)}</span></p>
            </Step>

            <Step title="How">
              <div className="px-4">
                <Segments label="How" value={how} onChange={setHow}
                  options={[['globus', 'Globus'], ['phone', 'Through this phone']] as const} />
              </div>
              <p className={NOTE}>
                {sync ? 'Cluster to cluster. Copying again only sends what changed.'
                  : 'Uses your mobile data. Keep HPC Hub open until it finishes.'}
                {!sync && files > BIG && ' Globus is much faster for this much.'}</p>
              {missing && <p className={NOTE}>Globus needs {missing} first. Set it up in Transfers.</p>}
            </Step>

            <Step title="What to take">
              <div className="border-t border-line">
                {plan?.parts.map((x) => (
                  <Tick key={x.name} title={x.name} size={x.size} checked={!!keep[x.name]}
                    onChange={(v) => setKeep({ ...keep, [x.name]: v })} />
                ))}
              </div>
              <p className={NOTE}>{what}</p>
            </Step>

            {plan && (plan.chats.length > 0 || plan.chats_error) && (
              <Step title="Claude chats">
                <div className="border-t border-line">
                  {plan.chats.map((c) => (
                    <Tick key={c.id} title={c.name} size={c.size} checked={!!chats[c.id]}
                      onChange={(v) => setChats({ ...chats, [c.id]: v })} />
                  ))}
                </div>
                <p className={NOTE}>{plan.chats_error ? `Couldn't read chats: ${plan.chats_error}`
                  : 'Tick the ones to keep going there.'}</p>
              </Step>
            )}
            {error && <p className="px-4 pt-4 select-text text-bad">{error}</p>}
          </>
        )}
      </Sheet>

      {open === 'to' && info && (
        <PickerSheet title="Copy to" value={to} onClose={() => setOpen('')}
          onPick={(v) => {
            setTo(v)
            setError('')
            if (info.targets.find((t) => t.id === v)?.globus_missing) setHow('phone')
          }}
          options={info.targets.map((t) => ({ value: t.id, label: shortCluster(t.name),
            hint: t.connected ? 'Connected' : 'Not connected' }))} />
      )}
      {open === 'folder' && dst && (
        <FolderPicker cluster={dst} start={intoPath} onPick={setInto} onClose={() => setOpen('')} />
      )}
    </>
  )
}
