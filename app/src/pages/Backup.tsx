import { BellRing, CircleAlert } from 'lucide-react'
import { useState } from 'react'

import { CopyView, DoneView } from '../components/backup/CopyDone'
import { risk as riskCopy, shortName } from '../components/backup/copy'
import { PlanView } from '../components/backup/PlanView'
import { RemindersDialog } from '../components/backup/RemindersDialog'
import { RiskView } from '../components/backup/Risk'
import { SpaceView } from '../components/backup/SpaceView'
import { Actions, ScanningStep, StartStep } from '../components/backup/Steps'
import { useBackup, type Step } from '../components/backup/useBackup'
import { NotConnected } from '../components/clusters/NotConnected'
import { EButton, EmptyState, EPage } from '../components/e/extra'
import { useActiveCluster } from '../components/clusters/active'
import { Spinner } from '../components/ui'
import { useGo, usePageParams } from '../nav'

const STEPS: [Step[], string][] = [[['start', 'scanning'], 'Check'], [['risk'], 'At risk'], [['plan'], 'Plan'],
  [['space'], 'Space'], [['copy', 'done'], 'Copy']]

function Steps({ step }: { step: Step }) {
  const at = STEPS.findIndex(([s]) => s.includes(step))
  return (
    <ol className="flex items-center gap-2 px-5 pb-6 text-sm" aria-label="Steps">
      {STEPS.map(([, title], i) => (
        <li key={title} aria-current={i === at ? 'step' : undefined} className="flex items-center gap-2">
          <span className={`grid size-6 place-items-center rounded-full text-xs font-semibold ${i === at
            ? 'bg-accent text-on-accent' : 'border border-line-strong text-dim'}`}>{i + 1}</span>
          <span className={i === at ? 'font-semibold' : 'text-dim'}>{title}</span>
          {i < STEPS.length - 1 && <span aria-hidden className="mx-1 h-px w-6 bg-line-strong" />}
        </li>
      ))}
    </ol>
  )
}

export function Backup() {
  const { clusters, cluster, session, connected, error } = useActiveCluster()
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
        <>
          <RiskView s={s} name={name} />
          <Actions>
            <EButton onClick={() => b.startScan()}>{riskCopy.again}</EButton>
            {s.at_risk_files > 0 || b.options.everything
              ? <EButton kind="primary" onClick={b.openPlan}>{riskCopy.plan}</EButton> : null}
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
      <EPage note={b.policy?.scratch && <span className="font-mono text-sm">{b.policy.scratch}</span>}
        actions={<EButton icon={BellRing} onClick={() => setRemind('open')}>
          {b.reminders?.enabled ? 'Weekly check on' : 'Reminders'}</EButton>}>
        <Steps step={b.step} />
        {b.error && <p className="flex items-start gap-2 px-5 pb-4 text-bad">
          <CircleAlert size={16} className="mt-0.5 shrink-0" />{b.error}</p>}
        {body}
      </EPage>
      {remind && <RemindersDialog value={remind === 'on' && b.reminders ? { ...b.reminders, enabled: true } : b.reminders}
        onClose={() => setRemind('')} onSave={(r) => { b.setReminders(r); setRemind('') }} />}
    </div>
  )
}
