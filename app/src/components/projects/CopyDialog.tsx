// Copy or sync a project to another cluster: through this laptop or with Globus, leaving big subfolders behind,
// and with its Claude chats so you can continue them there.
import { FolderOpen, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useEvent } from '../../hooks'
import { call } from '../../rpc'
import type { CopyPlan, CopyTargets, Place, Places, Project } from '../../types/projects'
import { Button, Dialog, IconButton, Spinner } from '../ui'
import { FolderPicker } from './FolderPicker'
import { CheckRow, EntryRow, Group, PropertyRow, SelectRow, Toggles } from './form'
import { formatSize } from './size'

type How = 'laptop' | 'globus'
const HOW: { value: How; label: string; note: string }[] = [
  { value: 'laptop', label: 'Through this laptop', note: 'Simple; fine for smaller projects' },
  { value: 'globus', label: 'Globus',
    note: 'Cluster to cluster, for big projects. Copying again only sends what changed' },
]
const BIG = 5 * 1024 ** 3

const inside = (into: string, path: string) => into === path || into.startsWith(path.replace(/\/+$/, '') + '/')

export function CopyDialog({ p, onClose, onStarted }:
  { p: Project; onClose: () => void; onStarted: (ids: string[], text: string) => void }) {
  const [info, setInfo] = useState<CopyTargets | null>(null)
  const [plan, setPlan] = useState<CopyPlan | null>(null)
  const [planError, setPlanError] = useState('')
  const [to, setTo] = useState('')
  const [into, setInto] = useState('~')
  const [how, setHow] = useState<How>('laptop')
  const [keep, setKeep] = useState<Record<string, boolean>>({})
  const [chats, setChats] = useState<Record<string, boolean>>({})
  const [found, setFound] = useState<{ cluster: string; storage: Place[] }>({ cluster: '', storage: [] })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)

  useEffect(() => {
    call<CopyTargets>('projects.copy_targets', { id: p.id }).then((t) => {
      const dst = t.targets.find((x) => x.id === t.copy_to) ?? t.targets[0]
      setInfo(t)
      setTo(dst?.id ?? '')
      setInto(t.copy_into || '~')
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

  const intoPath = into.trim() || '~'
  const spots = dst?.connected && found.cluster === dst.id ? found.storage : []
  const spot = spots.filter((s) => inside(intoPath, s.path)).sort((a, b) => b.path.length - a.path.length)[0]
  const missing = how === 'globus' ? dst?.globus_missing ?? '' : ''
  const files = (plan?.parts ?? []).filter((x) => keep[x.name]).reduce((n, x) => n + x.size, 0)
  const picked = (plan?.chats ?? []).filter((c) => chats[c.id])
  const sync = how === 'globus'
  const pickSpot = (name: string) => {
    const s = spots.find((x) => x.label === name)
    if (s && !inside(intoPath, s.path)) setInto(s.path)
  }

  const go = () => {
    if (!dst) return
    if (!dst.connected) return setError(`Connect to ${dst.name} first`)
    setBusy(true)
    call<{ id: string; chats: string }>('projects.copy', {
      id: p.id, to: dst.id, into: intoPath, how, size: files,
      skip: (plan?.parts ?? []).filter((x) => !keep[x.name]).map((x) => x.name), chats: picked.map((c) => c.id),
    }).then((r) => {
      onStarted([r.id, r.chats].filter(Boolean), `${sync ? 'Syncing' : 'Copying'} ${p.name} to ${dst.name}`)
      onClose()
    }).catch((e: Error) => { setError(e.message); setBusy(false) })
  }

  let what = 'Measuring sizes…'
  if (planError || plan?.parts_error) what = `Could not measure it: ${planError || plan?.parts_error}`
  else if (plan) {
    what = `${formatSize(files)} ${sync ? 'with Globus' : 'through this laptop'}. Untick what to leave behind.`
    if (!sync && files > BIG) what += ' That is big: Globus is much faster.'
  }
  let talk = 'Loading…'
  if (planError || plan?.chats_error) talk = `Could not read chats: ${planError || plan?.chats_error}`
  else if (plan) talk = plan.chats.length ? 'Tick the ones to continue there. Paths move to the new folder.'
    : 'No Claude chats in this folder.'
  const allChats = picked.length > 0 && picked.length === plan?.chats.length

  return (
    <>
      <Dialog title={`Copy or sync ${p.name}`} onClose={picking ? () => {} : onClose} width={580}
        actions={<>
          {busy && <Spinner />}
          <Button onClick={onClose}>Cancel</Button>
          <Button kind="suggested" disabled={!dst || !!missing || busy} onClick={go}>{sync ? 'Sync' : 'Copy'}</Button>
        </>}>
        {!info ? <div className="grid h-40 place-items-center">
            {error ? <p className="text-bad">{error}</p> : <Spinner size={24} />}</div>
          : info.targets.length === 0 ? <p className="py-8 text-center text-dim">Add another cluster first.</p> : (
          <div className="flex flex-col gap-6 pt-1 pb-2">
            <Group title="To">
              <SelectRow title="Cluster" value={to} onChange={(v) => { setTo(v); setError('') }}
                options={info.targets.map((t) => ({
                  value: t.id, label: t.connected ? t.name : `${t.name} (not connected)` }))} />
              <div className="flex min-h-[56px] items-center gap-3 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <div>Where</div>
                  <div className="text-sm text-dim">
                    {!dst?.connected ? `Connect to ${dst?.name} on the Clusters page to choose Home, Project or Scratch`
                      : spot?.label.startsWith('Scratch')
                        ? 'Scratch may be cleaned up after a while. Keep work you need in Project.' : ''}
                  </div>
                </div>
                {dst?.connected && (spots.length ? <Toggles active={spot?.label ?? null}
                  items={spots.map((s) => ({ name: s.label, tip: s.path }))}
                  onPick={pickSpot} />
                  : <Spinner />)}
              </div>
              <EntryRow title="Into folder" value={into} onChange={setInto} mono
                suffix={<IconButton icon={FolderOpen} label="Choose folder"
                  onClick={() => dst?.connected ? setPicking(true) : setError(`Connect to ${dst?.name} first`)} />} />
              <PropertyRow title="Will be"
                value={<span className="font-mono text-base">
                  {dst?.name}:{intoPath.replace(/\/+$/, '')}/{info.name}</span>} />
            </Group>

            <Group title="How">
              <SelectRow title="Copy with" subtitle={HOW.find((h) => h.value === how)?.note} value={how}
                onChange={setHow} options={HOW} />
              {missing && (
                <div className="flex items-center gap-3 bg-warn-bg px-4 py-3 text-warn">
                  <TriangleAlert size={20} className="shrink-0" />
                  <div>
                    <div className="font-semibold">Globus is not ready</div>
                    <div className="text-sm">Needs {missing}. Set it up on the Globus page.</div>
                  </div>
                </div>
              )}
            </Group>

            <Group title="What" description={what}>
              {plan?.parts.map((x) => (
                <CheckRow key={x.name} title={x.name} checked={!!keep[x.name]}
                  onChange={(v) => setKeep({ ...keep, [x.name]: v })}
                  suffix={<span className="text-base text-dim tabular-nums">{formatSize(x.size)}</span>} />
              ))}
            </Group>

            <Group title="Claude chats in this project" description={talk}
              suffix={plan && plan.chats.length > 0 && (
                <label className="flex shrink-0 items-center gap-2 text-base">
                  <input type="checkbox" checked={allChats} className="size-[16px] accent-[var(--color-accent)]"
                    onChange={(e) => setChats(Object.fromEntries(plan.chats.map((c) => [c.id, e.target.checked])))} />
                  Select all
                </label>
              )}>
              {plan?.chats.map((c) => (
                <CheckRow key={c.id} title={c.name} checked={!!chats[c.id]}
                  onChange={(v) => setChats({ ...chats, [c.id]: v })}
                  suffix={<span className="text-base text-dim tabular-nums">{formatSize(c.size)}</span>} />
              ))}
            </Group>
            {error && <p className="select-text px-1 text-base text-bad">{error}</p>}
          </div>
        )}
      </Dialog>
      {picking && dst && (
        <FolderPicker cluster={dst} start={intoPath} onPick={setInto} onClose={() => setPicking(false)} />
      )}
    </>
  )
}
