// New or edit a scheduled agent on the phone: the job, agent, folder and name, the task, and when it runs.
// The compute stays as it was (the cluster's node settings for a new one); the desktop can change it.
// Also the sheet with a schedule's last answer.
import { useEffect, useState } from 'react'

import { Spinner } from '@shared/components/ui'
import { useGo } from '@shared/nav'
import { call } from '@shared/rpc'
import type { ScheduleLog, ScheduleOptions, ScheduleStatus } from '@shared/types/schedules'
import { Button, Chips, DurationRow, Field, List, MainButton, PickerSheet, Row, Sheet, TextArea } from '../../ui'
import { FolderField } from './FolderField'

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const slug = (name: string) => name.trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) ||
  'agent'
const base = (folder: string) => folder.trim().replace(/\/+$/, '').split('/').pop()?.replace(/^~$/, '') || 'home'

export function ScheduleSheet({ cluster, clusterName, options: o, editing: sc, onClose, onSaved }: {
  cluster: string; clusterName: string; options: ScheduleOptions; editing: ScheduleStatus | null
  onClose: () => void; onSaved: (list: ScheduleStatus[], name: string) => void
}) {
  const [preset, setPreset] = useState(() => {
    const i = sc ? o.presets.findIndex((p) => p.task && p.task === sc.task) : 0
    return i < 0 ? o.presets.length - 1 : i
  })
  const [agent, setAgent] = useState(sc?.agent ?? o.agents[0].id)
  const [folder, setFolder] = useState(sc?.folder ?? o.folder)
  const [name, setName] = useState(sc?.name ?? slug(`${o.presets[0].role}-${base(o.folder)}`))
  const [task, setTask] = useState(sc?.task ?? o.presets[0].task)
  const [time, setTime] = useState(sc?.time ?? '02:00')
  const [days, setDays] = useState<string[]>((sc?.days ?? []).map(String))
  const [runFor, setRunFor] = useState(sc?.minutes ?? 120)
  const [choosing, setChoosing] = useState(false)
  const [pickAgent, setPickAgent] = useState(false)
  const [problem, setProblem] = useState('')
  const [saving, setSaving] = useState(false)

  const rename = (role: string, at: string) => { if (!sc) setName(slug(`${role}-${base(at)}`)) }
  const pickPreset = (i: number) => {
    setPreset(i)
    const p = o.presets[i]
    if (p.task) setTask(p.task)
    rename(p.role, folder)
  }
  const pickFolder = (path: string) => { setFolder(path); rename(o.presets[preset].role, path) }

  const save = () => {
    const at = time.trim()
    const minutes = Math.max(5, runFor)
    const why = !task.trim() ? 'Write a task first' : !TIME.test(at) ? 'Time must look like 02:00' : ''
    if (why) { setProblem(why); return }
    setSaving(true)
    const picked = days.map(Number).sort()
    const schedule = { name: slug(name), agent, folder: folder.trim() || '~', task: task.trim(), time: at,
      days: picked.length === 7 ? [] : picked, minutes, enabled: sc?.enabled ?? true, compute: sc?.compute ?? {} }
    call<ScheduleStatus[]>('schedules.save', { cluster, schedule, old_name: sc?.name ?? '' })
      .then((list) => onSaved(list, schedule.name))
      .catch((e: Error) => { setProblem(e.message); setSaving(false) })
  }

  // "Every day" is a chip of its own: on when no day is picked (or all of them are)
  const every = !days.length || days.length === 7
  const pickDays = (next: string[]) => setDays(!every && next.includes('all') ? [] : next.filter((d) => d !== 'all'))

  return (
    <Sheet title={sc ? 'Edit schedule' : 'New schedule'} flush onClose={onClose} actions={
      <MainButton disabled={saving} onClick={save}>
        {saving && <Spinner size={16} />}{sc && !sc.enabled ? 'Save' : 'Save and queue'}</MainButton>}>
      {problem && <p className="px-4 pb-2 font-semibold text-bad">{problem}</p>}
      <List>
        <Row label="Job" value={o.presets[preset]?.label} opens onPress={() => setChoosing(true)} />
        {o.agents.length > 1 && <Row label="Agent" value={o.agents.find((a) => a.id === agent)?.name} opens
          onPress={() => setPickAgent(true)} />}
      </List>
      <div className="px-4 pt-2">
        <FolderField cluster={cluster} name={clusterName} value={folder} onChange={pickFolder} />
        <Field label="Name" value={name} autoCapitalize="none" autoCorrect="off" onChange={(e) => setName(e.target.value)} />
        <TextArea label="Task" value={task} rows={6} onChange={(e) => setTask(e.target.value)}
          placeholder="Tell the agent what to do, like: update the plots in figures/ with the newest results" />
        <Field label="Time (cluster time)" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        <div className="py-2">
          <span className="mb-1 block text-sm text-dim">Days</span>
          <Chips value={every ? ['all'] : days} onChange={pickDays}
            options={[['all', 'Every day'] as const, ...o.days.map((d, i) => [String(i + 1), d] as const)]} />
        </div>
      </div>
      <List className="mt-2">
        <DurationRow label="Run for" minutes={runFor} onChange={setRunFor} />
      </List>
      {pickAgent && <PickerSheet title="Agent" value={agent} onClose={() => setPickAgent(false)}
        options={o.agents.map((a) => ({ value: a.id, label: a.name }))} onPick={setAgent} />}
      {choosing && <PickerSheet title="Job" value={String(preset)} onClose={() => setChoosing(false)}
        options={o.presets.map((p, i) => ({ value: String(i), label: p.label }))} onPick={(v) => pickPreset(Number(v))} />}
    </Sheet>
  )
}

export function LogSheet({ cluster, name, onClose }: { cluster: string; name: string; onClose: () => void }) {
  const go = useGo()
  const [log, setLog] = useState<ScheduleLog | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    call<ScheduleLog>('schedules.log', { cluster, name }).then(setLog).catch((e: Error) => setError(e.message))
  }, [cluster, name])
  return (
    <Sheet title={`Last answer of ${name}`} onClose={onClose} actions={log ? (
      <Button className="w-full" onClick={() => { onClose(); go('files', { cluster, path: log.folder }) }}>
        Open the logs folder</Button>) : undefined}>
      {error ? <p className="py-6 text-center text-bad">{error}</p>
        : !log ? <div className="grid h-40 place-items-center"><Spinner size={24} /></div>
          : !log.path ? <p className="py-6 text-center text-dim">It hasn't run yet. Answers go to {log.folder}.</p>
            : <>
                <p className="mb-2 text-sm break-all text-dim">{log.path}</p>
                <pre className="overflow-x-auto rounded-lg bg-soft p-3 font-mono text-xs whitespace-pre-wrap select-text">
                  {log.text || 'The answer is empty.'}</pre>
              </>}
    </Sheet>
  )
}
