// Backup agent: scratch deletes old files on most clusters. This page finds what is about to go, picks what matters
// (rules, then Claude for unclear folders, then you) and copies it to project on the cluster. It never deletes
// anything (hpc_hub/backup, methods/backup.py). The flow and its words are shared with the phone (components/backup).
import { BellRing, CircleAlert } from 'lucide-react'
import { useState } from 'react'

import { CopyView, DoneView } from '../components/backup/CopyDone'
import { gb, risk as riskCopy, shortName } from '../components/backup/copy'
import { PlanView } from '../components/backup/PlanView'
import { RemindersDialog } from '../components/backup/RemindersDialog'
import { FolderLine, RiskHead, RiskNotes, groupsOf } from '../components/backup/Risk'
import { SpaceView } from '../components/backup/SpaceView'
import { ScanningStep, StartStep } from '../components/backup/Steps'
import { useBackup, type Step } from '../components/backup/useBackup'
import { NotConnected } from '../components/clusters/NotConnected'
import { useClusters } from '../components/jobs/clusters'
import { Button, Card, EmptyState, PageHead, Spinner } from '../components/ui'
import { useGo, usePageParams } from '../nav'

const STEPS: [Step[], string][] = [[['start', 'scanning'], 'Check'], [['risk'], 'At risk'], [['plan'], 'Plan'],
  [['space'], 'Space'], [['copy', 'done'], 'Copy']]

function Steps({ step }: { step: Step }) {
  const at = STEPS.findIndex(([s]) => s.includes(step))
  return (
    <ol className="mb-6 flex items-center gap-2 text-sm" aria-label="Steps">
      {STEPS.map(([, title], i) => (
        <li key={title} aria-current={i === at ? 'step' : undefined} className="flex items-center gap-2">
          <span className={`grid size-6 place-items-center rounded-full text-xs font-semibold ${
            i < at ? 'bg-ok-bg text-ok' : i === at ? 'bg-accent text-white' : 'bg-pill text-dim'}`}>{i + 1}</span>
          <span className={i === at ? 'font-semibold' : 'text-dim'}>{title}</span>
          {i < STEPS.length - 1 && <span aria-hidden className="mx-1 h-px w-6 bg-line-strong" />}
        </li>
      ))}
    </ol>
  )
}

export function Backup() {
  const { clusters, cluster, session, connected, error } = useClusters()
  if (error) return <EmptyState icon={CircleAlert} title="Could not load clusters" text={error} />
  if (!clusters || !cluster) return <div className="grid h-full place-items-center"><Spinner size={24} /></div>
  if (!connected) return <NotConnected cluster={cluster} session={session} what="scratch" />
  return <Flow key={cluster.id} id={cluster.id} name={shortName(cluster.name)} />
}

function Flow({ id, name }: { id: string; name: string }) {
  const b = useBackup(id, usePageParams().step)
  const go = useGo()
  const [remind, setRemind] = useState<'' | 'open' | 'on'>('')  // on: from Check again next week, switched on
  const s = b.summary
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
      body = !s ? <div className="grid h-40 place-items-center"><Spinner size={20} /></div> : (
        <div className="flex flex-col gap-6">
          <RiskHead s={s} />
          {groupsOf(s).map((g) => (
            <section key={g.title} className="flex flex-col gap-2">
              <div className="flex items-baseline gap-3 px-1">
                <h3 className="text-md font-semibold">{g.title}</h3>
                <span className="text-sm text-dim tabular-nums">{g.files.toLocaleString('en-US')} files, {gb(g.bytes)}</span>
              </div>
              <Card className="divide-y divide-line overflow-hidden">
                {g.folders.map((f) => <FolderLine key={f.path} f={f} />)}
              </Card>
            </section>
          ))}
          {!s.at_risk_files && <p className="text-md text-dim">{riskCopy.nothing}</p>}
          <RiskNotes s={s} name={name} />
          <div className="flex gap-3">
            {s.at_risk_files > 0 || b.options.everything
              ? <Button kind="primary" size="lg" onClick={b.openPlan}>{riskCopy.plan}</Button> : null}
            <Button onClick={() => b.startScan()}>{riskCopy.again}</Button>
          </div>
        </div>
      )
      break
    case 'plan':
      body = <PlanView plan={b.plan} options={b.options} busy={b.busy} onToggle={b.toggle} onOptions={b.setOptions}
        onNext={() => b.setStep('space')} />
      break
    case 'space':
      body = <SpaceView plan={b.plan} policy={b.policy} options={b.options} tried={b.tried} progress={b.progress}
        busy={b.busy} onLeaveOut={b.leaveOutBiggest} onOptions={b.setOptions} onTry={b.tryFirst} onCopy={b.copy}
        onBack={() => b.setStep('plan')} />
      break
    case 'copy':
      body = <CopyView plan={b.plan} progress={b.progress} job={b.job} onStop={b.stopCopy} />
      break
    case 'done':
      body = <DoneView cluster={id} result={b.result}
        onOpen={() => go('files', { cluster: id, path: (b.result?.notes_path ?? '').replace(/\/[^/]*$/, '') })}
        onWeekly={() => setRemind('on')} onAgain={() => b.setStep('space')} />
      break
  }
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[760px] px-6 pt-6 pb-10">
        <PageHead subtitle={b.policy?.scratch}
          actions={<Button kind="ghost" onClick={() => setRemind('open')}>
            <BellRing size={16} />{b.reminders?.enabled ? 'Weekly check on' : 'Reminders'}</Button>} />
        <Steps step={b.step} />
        {b.error && <p className="mb-4 flex items-start gap-2 rounded-lg bg-bad-bg p-3 text-md text-bad">
          <CircleAlert size={16} className="mt-1 shrink-0" />{b.error}</p>}
        {body}
      </div>
      {remind && <RemindersDialog value={remind === 'on' && b.reminders ? { ...b.reminders, enabled: true } : b.reminders}
        onClose={() => setRemind('')} onSave={(r) => { b.setReminders(r); setRemind('') }} />}
    </div>
  )
}
