// Copy or sync a project to another cluster: where it goes, how (Globus cluster to cluster, or through this phone),
// what to leave behind, and which Claude chats come along. Same calls as the desktop's CopyDialog.
import { Check, TriangleAlert } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import { formatSize } from '@shared/components/projects/size'
import { Spinner } from '@shared/components/ui'
import { useEvent } from '@shared/hooks'
import { call } from '@shared/rpc'
import type { CopyPlan, CopyTargets, Place, Places, Project } from '@shared/types/projects'
import { Button, Chips, ListRow, PickerSheet, Segments, Sheet } from '../../ui'
import { FolderPicker } from './FolderPicker'

type How = 'globus' | 'phone'
const BIG = 5 * 1024 ** 3

const inside = (into: string, path: string) => into === path || into.startsWith(path.replace(/\/+$/, '') + '/')

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 flex items-center gap-2 font-bold">
        <span className="grid size-6 place-items-center rounded-full bg-pill text-xs">{n}</span>{title}</h2>
      {children}
    </section>
  )
}

/** A row you tick: name on the left, its size on the right. */
function Tick({ title, size, checked, onChange }:
  { title: string; size: number; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <button role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)}
      className="flex min-h-12 w-full items-center gap-3 py-2 text-left active:bg-hover">
      <span className={`grid size-6 shrink-0 place-items-center rounded-md border-2 ${
        checked ? 'border-accent bg-accent text-white' : 'border-line-strong'}`}>{checked && <Check size={16} />}</span>
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <span className="shrink-0 text-sm text-dim tabular-nums">{formatSize(size)}</span>
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
    if (!dst.connected) return setError(`Connect to ${dst.name} first`)
    setBusy(true)
    call<{ id: string; chats: string }>('projects.copy', {
      id: p.id, to: dst.id, into: intoPath, how: sync ? 'globus' : 'laptop', size: files,
      skip: (plan?.parts ?? []).filter((x) => !keep[x.name]).map((x) => x.name), chats: picked.map((c) => c.id),
    }).then((r) => {
      onStarted([r.id, r.chats].filter(Boolean), `${sync ? 'Syncing' : 'Copying'} ${p.name} to ${dst.name}`)
      onClose()
    }).catch((e: Error) => { setError(e.message); setBusy(false) })
  }

  let what = 'Measuring sizes…'
  if (planError || plan?.parts_error) what = `Couldn't measure it: ${planError || plan?.parts_error}`
  else if (plan) what = `${formatSize(files)} in all. Untick what to leave behind.`

  return (
    <>
      <Sheet title={`Copy ${p.name}`} onClose={onClose} actions={<>
        <Button className="flex-1" onClick={onClose}>Cancel</Button>
        <Button kind="primary" className="flex-1" disabled={!dst || !!missing || busy} onClick={go}>
          {busy ? <Spinner /> : sync ? 'Sync' : 'Copy'}</Button></>}>
        {!info ? <div className="grid h-40 place-items-center">
            {error ? <p className="text-bad">{error}</p> : <Spinner size={24} />}</div>
          : info.targets.length === 0 ? <p className="py-8 text-center text-dim">Add another cluster first.</p> : (
          <>
            <Step n={1} title="Where to">
              <div className="divide-y divide-line">
                <ListRow title="Cluster"
                  subtitle={dst ? (dst.connected ? dst.name : `${dst.name}, not connected`) : 'Pick one'}
                  onClick={() => setOpen('to')} />
                <ListRow title="Into folder" subtitle={<span className="font-mono">{intoPath}</span>}
                  onClick={() => dst?.connected ? setOpen('folder') : setError(`Connect to ${dst?.name} first`)} />
              </div>
              {spots.length > 0 && (
                <div className="mt-2">
                  <Chips one value={spot ? [spot.label] : []} options={spots.map((s) => [s.label, s.label] as const)}
                    onChange={([label]) => {
                      const s = spots.find((x) => x.label === label)
                      if (s && !inside(intoPath, s.path)) setInto(s.path)
                    }} />
                  {spot?.label.startsWith('Scratch') && (
                    <p className="mt-1 text-sm text-dim">Scratch may be cleaned up after a while. Keep work you need in
                      Project.</p>
                  )}
                </div>
              )}
              {dst && !dst.connected && (
                <p className="mt-2 text-sm text-dim">Connect to {dst.name} on Clusters to pick Home, Project or
                  Scratch.</p>
              )}
              <p className="mt-2 text-sm text-dim">It lands in <span className="font-mono">
                {intoPath.replace(/\/+$/, '')}/{info.name}</span></p>
            </Step>

            <Step n={2} title="How">
              <Segments value={how} onChange={setHow}
                options={[['globus', 'Globus'], ['phone', 'Through this phone']] as const} />
              <p className="mt-2 text-sm text-dim">
                {sync ? 'Cluster to cluster, so nothing passes through your phone. Copying again only sends what changed.'
                  : 'Uses your mobile data. Keep HPC Hub open until it finishes.'}
                {!sync && files > BIG && ' This is big, so Globus is much better.'}</p>
              {missing && (
                <div className="mt-2 flex items-start gap-3 rounded-xl bg-warn-bg p-3 text-warn">
                  <TriangleAlert size={20} className="mt-0.5 shrink-0" />
                  <p>Globus isn't ready yet: it needs {missing}. Set it up in More, Transfers.</p>
                </div>
              )}
            </Step>

            <Step n={3} title="What to take">
              <p className="mb-1 text-sm text-dim">{what}</p>
              <div className="divide-y divide-line">
                {plan?.parts.map((x) => (
                  <Tick key={x.name} title={x.name} size={x.size} checked={!!keep[x.name]}
                    onChange={(v) => setKeep({ ...keep, [x.name]: v })} />
                ))}
              </div>
            </Step>

            {plan && (plan.chats.length > 0 || plan.chats_error) && (
              <Step n={4} title="Claude chats">
                <p className="mb-1 text-sm text-dim">
                  {plan.chats_error ? `Couldn't read chats: ${plan.chats_error}`
                    : 'Tick the ones to continue there. Their paths move to the new folder.'}</p>
                <div className="divide-y divide-line">
                  {plan.chats.map((c) => (
                    <Tick key={c.id} title={c.name} size={c.size} checked={!!chats[c.id]}
                      onChange={(v) => setChats({ ...chats, [c.id]: v })} />
                  ))}
                </div>
              </Step>
            )}
            {error && <p className="select-text rounded-xl bg-bad-bg p-3 text-bad">{error}</p>}
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
          options={info.targets.map((t) => ({ value: t.id, label: t.name,
            hint: t.connected ? 'Connected' : 'Not connected' }))} />
      )}
      {open === 'folder' && dst && (
        <FolderPicker cluster={dst} start={intoPath} onPick={setInto} onClose={() => setOpen('')} />
      )}
    </>
  )
}
