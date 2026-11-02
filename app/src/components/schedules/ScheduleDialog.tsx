// New or edit a scheduled agent: the job, agent, folder and name, the task, when it runs, and its compute.
import { CircleAlert, FolderOpen } from 'lucide-react'
import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { Limits } from '../../types/clusters'
import type { Place, ProjectList } from '../../types/projects'
import type { ScheduleOptions, ScheduleStatus } from '../../types/schedules'
import { EntryRow, Group } from '../clusters/fields'
import { FolderPicker } from '../projects/FolderPicker'
import { SelectRow } from '../projects/form'
import { Button, Dialog, IconButton, Spinner } from '../ui'
import { computeText } from './format'
import { ComputeRows, DaysRow, DurationRow, ownFrom, type OwnCompute } from './rows'

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const slug = (name: string) => name.trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) ||
  'agent'
const base = (folder: string) => folder.trim().replace(/\/+$/, '').split('/').pop()?.replace(/^~$/, '') || 'home'

export function ScheduleDialog({ cluster, clusterName, options: o, editing, onClose, onSaved }: {
  cluster: string; clusterName: string; options: ScheduleOptions; editing: ScheduleStatus | null
  onClose: () => void; onSaved: (list: ScheduleStatus[], name: string) => void
}) {
  const sc = editing
  const [preset, setPreset] = useState(() => {
    const i = sc ? o.presets.findIndex((p) => p.task && p.task === sc.task) : 0
    return String(i < 0 ? o.presets.length - 1 : i)
  })
  const [agent, setAgent] = useState(sc?.agent ?? o.agents[0].id)
  const [folder, setFolder] = useState(sc?.folder ?? o.folder)
  const [name, setName] = useState(sc?.name ?? slug(`${o.presets[0].role}-${base(o.folder)}`))
  const [task, setTask] = useState(sc?.task ?? o.presets[0].task)
  const [time, setTime] = useState(sc?.time ?? '02:00')
  const [days, setDays] = useState<number[]>(sc?.days ?? [])
  const [minutes, setMinutes] = useState(sc?.minutes ?? 120)
  const [own, setOwn] = useState(!!sc && Object.keys(sc.compute).length > 0)
  const [compute, setCompute] = useState<OwnCompute>(ownFrom(o.profile, sc?.compute ?? {}))
  const [projects, setProjects] = useState<Place[]>([])
  const [limits, setLimits] = useState<Limits | null>(null)
  const [picker, setPicker] = useState(false)
  const [problem, setProblem] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    call<ProjectList>('projects.list').then((l) => setProjects(l.projects.filter((p) => p.cluster === cluster)
      .sort((a, b) => b.opened - a.opened).map((p) => ({ label: p.name, path: p.path })))).catch(() => {})
  }, [cluster])
  const partition = own ? compute.partition : o.profile.partition
  const qos = own ? compute.qos : o.profile.qos ?? ''
  useEffect(() => {
    const t = setTimeout(() => call<Limits>('clusters.partitions', { cluster, partition, qos }).then((l) => {
      setLimits(l)
      if (l.longest) setMinutes((m) => Math.min(m, l.longest!))
    }).catch(() => {}), 250)
    return () => clearTimeout(t)
  }, [cluster, partition, qos])

  const rename = (role: string, at: string) => { if (!sc) setName(slug(`${role}-${base(at)}`)) }
  const pickPreset = (i: string) => {
    setPreset(i)
    const p = o.presets[Number(i)]
    if (p.task) setTask(p.task)
    rename(p.role, folder)
  }
  const pickFolder = (path: string) => { setFolder(path); rename(o.presets[Number(preset)].role, path) }
  const project = projects.findIndex((p) => p.path.replace(/\/+$/, '') === folder.trim().replace(/\/+$/, ''))

  const save = () => {
    const at = time.trim()
    const why = !task.trim() ? 'Write a task' : !TIME.test(at) ? 'Time must look like 02:00' : ''
    if (why) { setProblem(why); return }
    setSaving(true)
    const schedule = { name: slug(name), agent, folder: folder.trim() || '~', task: task.trim(), time: at,
      days: days.length === 7 ? [] : days, minutes, enabled: sc?.enabled ?? true,
      compute: own ? { ...compute, partition: compute.partition.trim(), account: compute.account.trim(),
        qos: compute.qos.trim() } : {} }
    call<ScheduleStatus[]>('schedules.save', { cluster, schedule, old_name: sc?.name ?? '' })
      .then((list) => onSaved(list, schedule.name))
      .catch((e: Error) => { setProblem(e.message); setSaving(false) })
  }

  return (
    <Dialog title={sc ? 'Edit schedule' : 'New schedule'} onClose={onClose} width={620}
      actions={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button kind="suggested" disabled={saving} onClick={save}>
          {saving && <Spinner size={14} />}{sc && !sc.enabled ? 'Save' : 'Save and queue'}</Button>
      </>}>
      {problem && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-bad-bg px-3 py-2.5 text-bad">
          <CircleAlert size={16} className="shrink-0" /><span>{problem}</span>
        </div>
      )}
      <Group>
        <SelectRow title="Job" value={preset} onChange={pickPreset}
          options={o.presets.map((p, i) => ({ value: String(i), label: p.label }))} />
        <SelectRow title="Agent" value={agent} onChange={setAgent}
          options={o.agents.map((a) => ({ value: a.id, label: a.name }))} />
        {projects.length > 0 && <SelectRow title="Project" value={String(project)}
          onChange={(i) => i !== '-1' && pickFolder(projects[Number(i)].path)}
          options={[{ value: '-1', label: 'Pick a folder instead' },
            ...projects.map((p, i) => ({ value: String(i), label: p.label }))]} />}
        <div className="flex items-center pr-3">
          <div className="min-w-0 flex-1"><EntryRow label="Folder" value={folder} onChange={setFolder} /></div>
          <IconButton icon={FolderOpen} label="Choose folder" size={16} onClick={() => setPicker(true)} />
        </div>
        <EntryRow label="Name" value={name} onChange={setName} />
      </Group>
      <h3 className="mb-1 text-md font-semibold">Task</h3>
      <p className="mb-2 text-sm text-dim">What the agent does on each run.</p>
      <textarea value={task} onChange={(e) => setTask(e.target.value)} rows={6} spellCheck={false}
        placeholder="Tell the agent what to do, like: update the plots in figures/ with the newest results"
        className="mb-5 w-full resize-y rounded-xl bg-card px-4 py-3 shadow-[var(--shadow-card)] outline-none
          placeholder:text-dim focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus" />
      <Group title="When">
        <EntryRow label="Time (24 h, cluster time)" value={time} onChange={setTime} placeholder="02:00" />
        <DaysRow names={o.days} days={days} onChange={setDays} />
        <DurationRow total={minutes} limits={limits} onChange={setMinutes} />
      </Group>
      <Group title="Compute" description="Runs at the set time, even with your laptop off.">
        <SelectRow title="Resources" subtitle={own ? undefined : computeText(ownFrom(o.profile, {}))} value={own ? 'own' : 'node'}
          onChange={(v) => setOwn(v === 'own')} options={[{ value: 'node', label: 'Same as your compute node' },
            { value: 'own', label: 'Set here' }]} />
        {own && <ComputeRows cluster={cluster} value={compute} limits={limits} onChange={setCompute} />}
      </Group>
      {picker && <FolderPicker cluster={{ id: cluster, name: clusterName, connected: true }} start={folder || '~'}
        projects={projects} onPick={pickFolder} onClose={() => setPicker(false)} />}
    </Dialog>
  )
}
