import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { Limits, Profile } from '../../types/clusters'
import type { Place, ProjectList } from '../../types/projects'
import type { ScheduleOptions, ScheduleStatus } from '../../types/schedules'
import { minutes as minutesOf, slurmTime } from '../clusters/time'
import { ChoiceRow, Chips, TextArea } from '../e/extra'
import { NodeFields } from '../e/NodeFields'
import { DurationRow, EDialog, Field, inRange, List, MainButton, Segments } from '../e/ui'
import { FolderField } from '../tools/fields'
import { Spinner } from '../ui'
import { computeText } from './format'
import { ownFrom, type OwnCompute } from './rows'

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
  const [days, setDays] = useState<string[]>((sc?.days ?? []).map(String))
  const [minutes, setMinutes] = useState(sc?.minutes ?? 120)
  const [own, setOwn] = useState(!!sc && Object.keys(sc.compute).length > 0)
  const [compute, setCompute] = useState<OwnCompute>(ownFrom(o.profile, sc?.compute ?? {}))
  const [fits, setFits] = useState(true)
  const [projects, setProjects] = useState<Place[]>([])
  const [limits, setLimits] = useState<Limits | null>(null)
  const [problem, setProblem] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    call<ProjectList>('projects.list').then((l) => setProjects(l.projects.filter((p) => p.cluster === cluster)
      .sort((a, b) => b.opened - a.opened).map((p) => ({ label: p.name, path: p.path })))).catch(() => {})
  }, [cluster])
  // the longest a run may take, for the node settings' queue (NodeFields reads its own when it has one)
  const partition = o.profile.partition
  const qos = o.profile.qos ?? ''
  useEffect(() => {
    if (own) return
    const t = setTimeout(() => call<Limits>('clusters.partitions', { cluster, partition, qos }).then(setLimits)
      .catch(() => {}), 250)
    return () => clearTimeout(t)
  }, [cluster, partition, qos, own])

  const rename = (role: string, at: string) => { if (!sc) setName(slug(`${role}-${base(at)}`)) }
  const pickPreset = (i: string) => {
    setPreset(i)
    const p = o.presets[Number(i)]
    if (p.task) setTask(p.task)
    rename(p.role, folder)
  }
  const pickFolder = (path: string) => { setFolder(path); rename(o.presets[Number(preset)].role, path) }

  // its own size as a node profile, so NodeFields can show it; the time there is how long each run may take
  const profile: Profile = { ...o.profile, ...compute, time: slurmTime(minutes) }
  const fromProfile = (p: Profile) => {
    setCompute({ cpus: p.cpus, mem_gb: p.mem_gb, gpus: p.gpus ?? 0, gpu_type: p.gpu_type ?? '',
      partition: p.partition, account: p.account ?? '', qos: p.qos ?? '' })
    setMinutes(minutesOf(p.time) ?? minutes)
  }
  const ok = own ? fits : inRange(minutes, 1, limits?.longest)

  const save = () => {
    const at = time.trim()
    const why = !task.trim() ? 'Write a task first' : !TIME.test(at) ? 'Time must look like 02:00' : ''
    if (why) { setProblem(why); return }
    setSaving(true)
    const picked = days.map(Number).sort()
    const schedule = { name: slug(name), agent, folder: folder.trim() || '~', task: task.trim(), time: at,
      days: picked.length === 7 ? [] : picked, minutes, enabled: sc?.enabled ?? true,
      compute: own ? { ...compute, partition: compute.partition.trim(), account: compute.account.trim(),
        qos: compute.qos.trim() } : {} }
    call<ScheduleStatus[]>('schedules.save', { cluster, schedule, old_name: sc?.name ?? '' })
      .then((list) => onSaved(list, schedule.name))
      .catch((e: Error) => { setProblem(e.message); setSaving(false) })
  }

  // "Every day" is a chip of its own: on when no day is picked (or all of them are)
  const every = !days.length || days.length === 7
  const pickDays = (next: string[]) => setDays(!every && next.includes('all') ? [] : next.filter((d) => d !== 'all'))

  return (
    <EDialog title={sc ? 'Edit schedule' : 'New schedule'} width={580} onClose={onClose}
      actions={<MainButton disabled={saving || !ok} onClick={save}>
        {saving && <Spinner size={16} />}{sc && !sc.enabled ? 'Save' : 'Save and queue'}</MainButton>}>
      {problem && <p className="px-5 pb-2 font-semibold text-bad">{problem}</p>}
      <List>
        <ChoiceRow label="Job" value={preset} onChange={pickPreset}
          options={o.presets.map((p, i) => ({ value: String(i), label: p.label }))} />
        {o.agents.length > 1 && <ChoiceRow label="Agent" value={agent} onChange={setAgent}
          options={o.agents.map((a) => ({ value: a.id, label: a.name }))} />}
      </List>
      <div className="px-5 pt-2">
        <FolderField cluster={{ id: cluster, name: clusterName }} value={folder} onChange={pickFolder}
          projects={projects} />
        <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <TextArea label="Task" value={task} rows={4} onChange={(e) => setTask(e.target.value)}
          placeholder="Tell the agent what to do, like: update the plots in figures/ with the newest results" />
        <div className="w-44"><Field label="Time (cluster time)" type="time" value={time}
          onChange={(e) => setTime(e.target.value)} /></div>
        <div className="py-1.5">
          <span className="mb-1.5 block text-sm text-dim">Days</span>
          <Chips label="Days" value={every ? ['all'] : days} onChange={pickDays}
            options={[['all', 'Every day'] as const, ...o.days.map((d, i) => [String(i + 1), d.slice(0, 3)] as const)]} />
        </div>
      </div>
      <section className="pt-5">
        <h3 className="px-5 pb-2 text-xs font-semibold tracking-wide text-dim uppercase">Compute node</h3>
        <div className="px-5 pb-2"><Segments label="Compute node" value={own ? 'own' : 'node'}
          onChange={(v) => setOwn(v === 'own')}
          options={[['node', 'Your node settings'], ['own', 'Its own size']] as const} /></div>
        {own
          ? <div className="pt-2"><NodeFields cluster={cluster} value={profile} onChange={fromProfile}
              onValid={setFits} /></div>
          : <>
              <p className="px-5 pb-3 text-sm text-dim">{computeText(ownFrom(o.profile, {}))}</p>
              <List><DurationRow label="Time each run may take" minutes={minutes} max={limits?.longest}
                onChange={setMinutes} /></List>
            </>}
        <p className="px-5 pt-2 text-sm text-dim">Runs at the set time, even with your laptop off.</p>
      </section>
    </EDialog>
  )
}
