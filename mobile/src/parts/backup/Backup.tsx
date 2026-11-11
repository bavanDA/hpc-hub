// Agents › Backup: the desktop's steps (check, at risk, plan, space, copy), one column, for the cluster picked in the
// header. A notification or Files' banner about scratch opens the plan directly (go('backup', { step: 'plan' })).
import { BellRing, CircleAlert } from 'lucide-react'
import { useState } from 'react'

import { Actions } from '@shared/components/backup/Actions'
import { Bar } from '@shared/components/backup/Bar'
import { copying, DAYS, reminders as copy, risk as riskCopy } from '@shared/components/backup/copy'
import { DoneView } from '@shared/components/backup/DoneView'
import type { Step } from '@shared/components/backup/flow'
import { gb, shortName } from '@shared/components/backup/format'
import { HORIZONS } from '@shared/components/backup/horizons'
import { PlanView } from '@shared/components/backup/PlanView'
import { RiskView } from '@shared/components/backup/Risk'
import { ScanningStep } from '@shared/components/backup/ScanningStep'
import { SpaceView } from '@shared/components/backup/SpaceView'
import { StartStep } from '@shared/components/backup/StartStep'
import { useBackup } from '@shared/components/backup/useBackup'
import { useActiveCluster } from '@shared/components/clusters/active'
import { NotConnected } from '@shared/components/clusters/NotConnected'
import { Spinner } from '@shared/components/ui/Spinner'
import { useGo, usePageParams } from '@shared/nav'
import type { Plan, Progress, Reminders } from '@shared/types/backup'
import { Button, ConfirmDialog, Dialog, EmptyState, List, MainButton, PageBar, PickDialog, Row, ToggleRow } from '../../ui'

export function Backup() {
  const { clusters, cluster, session, connected, error } = useActiveCluster()
  if (error) return <EmptyState icon={CircleAlert} title="Could not load clusters" text={error} report />
  if (!clusters || !cluster) return <div className="grid h-full place-items-center"><Spinner size={24} /></div>
  if (!connected) return <div className="h-[60vh]"><NotConnected cluster={cluster} session={session} what="scratch" /></div>
  return <Flow key={cluster.id} id={cluster.id} name={shortName(cluster.name)} />
}

const STEPS: [Step[], string][] = [[['start', 'scanning'], 'Check'], [['risk'], 'At risk'], [['plan'], 'Plan'],
  [['space'], 'Space'], [['copy', 'done'], 'Copy']]

/** The desktop's step bar, each number over its name so the five fit. */
function StepBar({ step }: { step: Step }) {
  const at = STEPS.findIndex(([s]) => s.includes(step))
  return (
    <ol className="flex items-center justify-between px-5 pb-5" aria-label="Steps">
      {STEPS.map(([, title], i) => (
        <li key={title} aria-current={i === at ? 'step' : undefined}
          className={`flex flex-col items-center gap-1 text-xs ${i === at ? 'font-semibold' : 'text-dim'}`}>
          <span className={`grid size-6 place-items-center rounded-full font-semibold ${i === at
            ? 'bg-accent text-on-accent' : 'border border-line-strong'}`}>{i + 1}</span>
          {title}
        </li>
      ))}
    </ol>
  )
}

function Flow({ id, name }: { id: string; name: string }) {
  const b = useBackup(id, usePageParams().step)
  const go = useGo()
  const [remind, setRemind] = useState<'' | 'open' | 'on'>('')  // on: from Check again next week, switched on
  const s = b.summary
  const loading = <div className="grid h-40 place-items-center"><Spinner size={20} /></div>
  let body
  switch (b.step) {
    case 'start':
      body = <StartStep name={name} policy={b.policy} last={b.scan} busy={b.busy}
        onCheck={(everything, agent) => b.startScan(everything, agent)} onLast={() => b.setStep('risk')} />
      break
    case 'scanning':
      body = <ScanningStep scan={b.scan} onStop={b.stopScan} onAgain={() => b.startScan()} />
      break
    case 'risk':
      body = !s ? loading : (
        <>
          <RiskView s={s} name={name} />
          <Actions>
            <Button onClick={() => b.startScan()}>{riskCopy.again}</Button>
            {s.at_risk_files > 0 || b.options.everything
              ? <Button kind="primary" onClick={b.openPlan}>{riskCopy.plan}</Button> : null}
          </Actions>
        </>
      )
      break
    case 'plan':
      body = <PlanView plan={b.plan} options={b.options} busy={b.busy} onToggle={b.toggle} onOptions={b.setOptions}
        onNext={() => b.setStep('space')} onBack={() => b.setStep('risk')} />
      break
    case 'space':
      body = <SpaceView plan={b.plan} policy={b.policy} options={b.options} tried={b.tried} progress={b.progress}
        busy={b.busy} onLeaveOut={b.leaveOutBiggest} onOptions={b.setOptions} onTry={b.tryFirst} onCopy={b.copy}
        onBack={() => b.setStep('plan')} />
      break
    case 'copy':
      body = <CopyStep plan={b.plan} progress={b.progress} job={b.job} onStop={b.stopCopy} />
      break
    case 'done':
      body = <DoneView cluster={id} result={b.result}
        onOpen={() => go('files', { cluster: id, path: (b.result?.notes_path ?? '').replace(/\/[^/]*$/, '') })}
        onWeekly={() => setRemind('on')} onAgain={() => b.setStep('space')} />
      break
  }
  return (
    <>
      <PageBar>
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-dim">{b.policy?.scratch}</span>
        <Button icon={BellRing} onClick={() => setRemind('open')}>
          {b.reminders?.enabled ? 'Weekly check on' : 'Reminders'}</Button>
      </PageBar>
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        <StepBar step={b.step} />
        {b.error && <p className="flex items-start gap-2 px-5 pb-4 text-bad">
          <CircleAlert size={16} className="mt-0.5 shrink-0" />{b.error}</p>}
        {body}
      </div>
      {remind && <RemindersDialog value={remind === 'on' && b.reminders ? { ...b.reminders, enabled: true } : b.reminders}
        onClose={() => setRemind('')} onSave={(r) => { b.setReminders(r); setRemind('') }} />}
    </>
  )
}

/** The desktop's copy step, its stop question closed by Back. */
function CopyStep({ plan, progress, job, onStop }:
  { plan: Plan | null; progress: Progress | null; job: string; onStop: () => void }) {
  const [asking, setAsking] = useState(false)
  const total = progress?.total_bytes || plan?.bytes || 0
  const share = total ? (progress?.done_bytes ?? 0) / total : 0
  return (
    <div className="flex flex-col gap-3">
      <h2 className="flex items-center gap-3 px-5 text-lg font-semibold"><Spinner size={18} />
        {copying.title(gb(total))}</h2>
      <div className="px-5"><Bar value={share} label="Copied" /></div>
      <p className="px-5 text-dim tabular-nums">
        {progress?.state === 'verifying' ? copying.verifying : progress?.detail || 'Starting'}</p>
      {job && <p className="px-5 text-sm text-dim">{copying.job(job)}</p>}
      <Actions><Button onClick={() => setAsking(true)}>{copying.stop}</Button></Actions>
      {asking && <ConfirmDialog title={copying.stopTitle} text={copying.stopText} keep={copying.keep} confirm={copying.stop}
        danger onConfirm={onStop} onClose={() => setAsking(false)} />}
    </div>
  )
}

/** The desktop's reminders window, with the phone's pickers so Back closes them first. */
function RemindersDialog({ value, onSave, onClose }:
  { value: Reminders | null; onSave: (r: Reminders) => void; onClose: () => void }) {
  const [r, setR] = useState<Reminders>(value ?? { enabled: true, days: [1], time: '03:00', horizon_days: 7 })
  const [picking, setPicking] = useState<'' | 'day' | 'horizon'>('')
  const day = r.days[0] ?? 1
  return (
    <Dialog title={copy.title} width={460} onClose={onClose}
      actions={<MainButton onClick={() => onSave(r)}>{copy.save}</MainButton>}>
      <List>
        <ToggleRow label={copy.weekly} sub={copy.weeklyHint} checked={r.enabled}
          onChange={(enabled) => setR({ ...r, enabled })} />
        {r.enabled && <>
          <Row label={copy.day} value={DAYS[day - 1]} opens onPress={() => setPicking('day')} />
          <label className="flex min-h-12 items-center gap-3 border-b border-line px-5 py-1.5">
            <span className="flex-1">{copy.time}</span>
            <input type="time" aria-label={copy.time} value={r.time} onChange={(e) => setR({ ...r, time: e.target.value })}
              className="h-9 rounded-lg border border-line-strong bg-window px-2.5 tabular-nums outline-none
                focus:border-accent focus:ring-1 focus:ring-accent" />
          </label>
          <Row label="Warn me" value={`${r.horizon_days} days ahead`} opens onPress={() => setPicking('horizon')} />
        </>}
      </List>
      {value?.next && r.enabled && <p className="px-5 pt-2 text-sm text-dim">{copy.next(new Date(value.next)
        .toLocaleString('en-US', { weekday: 'long', hour: '2-digit', minute: '2-digit' }))}</p>}
      {picking === 'day' && <PickDialog title={copy.day} value={String(day)} onClose={() => setPicking('')}
        onPick={(v) => setR({ ...r, days: [Number(v)] })}
        options={DAYS.map((d, i) => ({ value: String(i + 1), label: d }))} />}
      {picking === 'horizon' && <PickDialog title="Warn me" value={String(r.horizon_days)} onClose={() => setPicking('')}
        onPick={(v) => setR({ ...r, horizon_days: Number(v) })}
        options={HORIZONS.map((d) => ({ value: String(d), label: `${d} days ahead` }))} />}
    </Dialog>
  )
}
