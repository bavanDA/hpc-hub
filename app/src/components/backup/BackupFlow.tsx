import { BellRing, CircleAlert } from 'lucide-react'
import { useState } from 'react'

import { useGo, usePageParams } from '../../nav'
import { EButton } from '../e/EButton'
import { EPage } from '../e/EPage'
import { Spinner } from '../ui'
import { risk as riskCopy } from './copy'
import { CopyView, DoneView } from './CopyDone'
import { PlanView } from './PlanView'
import { RemindersDialog } from './RemindersDialog'
import { RiskView } from './Risk'
import { SpaceView } from './SpaceView'
import { StepBar } from './StepBar'
import { Actions, ScanningStep, StartStep } from './Steps'
import { useBackup } from './useBackup'

export function BackupFlow({ id, name }: { id: string; name: string }) {
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
        <StepBar step={b.step} />
        {b.error && <p className="flex items-start gap-2 px-5 pb-4 text-bad">
          <CircleAlert size={16} className="mt-0.5 shrink-0" />{b.error}</p>}
        {body}
      </EPage>
      {remind && <RemindersDialog value={remind === 'on' && b.reminders ? { ...b.reminders, enabled: true } : b.reminders}
        onClose={() => setRemind('')} onSave={(r) => { b.setReminders(r); setRemind('') }} />}
    </div>
  )
}
