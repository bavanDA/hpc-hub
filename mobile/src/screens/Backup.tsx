// More › Backup agent: the desktop's steps (check, at risk, plan, space, copy) in one column of rows, with the step's
// main button kept at the bottom of the screen. The space check runs by itself when its step opens, so the next tap
// copies. A notification about scratch opens here, on the plan when there is one.
import { BellRing, WifiOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import {
  copying, DAYS, done as doneCopy, plan as planCopy, reminders as remindCopy, risk, scanning, space as spaceCopy, start,
} from '@shared/components/backup/copy'
import { gb, shortName } from '@shared/components/backup/format'
import { HORIZONS } from '@shared/components/backup/RemindersDialog'
import { useBackup } from '@shared/components/backup/useBackup'
import { useGo, usePageParams } from '@shared/nav'
import type { Reminders } from '@shared/types/backup'
import { usePhoneNav } from '../nav'
import { CopyCard, DoneCard, PlanList, RiskView, ScanView, SpaceCard, StartView } from '../parts/backup/Steps'
import { phone } from '../parts/backup/words'
import { Header } from '../parts/Header'
import { useConnected } from '../parts/useConnected'
import { Button, ConfirmSheet, EmptyState, List, PickerSheet, Row, Segments, Sheet, ToggleRow } from '../ui'

export function Backup() {
  const { live, current, pick } = useConnected()
  const { open: openTab } = usePhoneNav()
  if (!current) {
    return (
      <div className="flex h-full flex-col">
        <Header title={start.title} />
        <div className="flex flex-1 flex-col justify-center">
          <EmptyState icon={WifiOff} title="No cluster connected" text="Connect a cluster to check its scratch."
            action={<Button kind="primary" onClick={() => openTab('clusters')}>Go to Clusters</Button>} />
        </div>
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col">
      {live.length > 1 && <div className="order-1 px-4 pb-3"><Segments label="Cluster" value={current.id}
        options={live.map((c) => [c.id, shortName(c.name)] as const)} onChange={pick} /></div>}
      <Flow key={current.id} id={current.id} name={shortName(current.name)}
        full={live.length > 1 ? shortName(current.name) : current.name} />
    </div>
  )
}

// full: the cluster's full name for the first line, unless the cluster picker above already shows it
function Flow({ id, name, full }: { id: string; name: string; full: string }) {
  const b = useBackup(id, usePageParams().step)
  const go = useGo()
  const [agent, setAgent] = useState(true)
  const [remind, setRemind] = useState<'' | 'open' | 'on'>('')  // on: from Check again next week, switched on
  const [stopping, setStopping] = useState(false)
  const tried = useRef('')  // the plan the space check last ran for, so it runs once per plan by itself
  const s = b.summary
  const plan = b.plan
  const blocked = !!plan && !plan.space.fits
  const ready = !!plan && plan.exact && b.tried === 'yes'

  const { step, tryFirst } = b
  useEffect(() => {
    if (step !== 'space' || !plan || blocked || b.tried || b.busy || tried.current === plan.hash) return
    tried.current = plan.hash
    tryFirst()
  }, [step, plan, blocked, b.tried, b.busy, tryFirst])

  let body
  let main: React.ReactNode = null
  let second: React.ReactNode = null
  switch (b.step) {
    case 'start':
      body = <StartView name={full} policy={b.policy} agent={agent} onAgent={setAgent}
        onLast={b.scan?.state === 'done' ? () => b.setStep('risk') : undefined} />
      main = <Button kind="primary" className="flex-1" disabled={b.busy}
        onClick={() => b.startScan(false, agent ? 'claude' : '')}>
        {b.policy && b.policy.purge.days <= 0 ? start.anyway : start.check}</Button>
      break
    case 'scanning':
      body = <ScanView scan={b.scan} />
      main = b.scan?.state === 'failed'
        ? <Button kind="primary" className="flex-1" onClick={() => b.startScan()}>{scanning.again}</Button>
        : <Button className="flex-1" onClick={b.stopScan}>Stop checking</Button>
      break
    case 'risk':
      body = s ? <RiskView s={s} name={name} /> : null
      main = s && (s.at_risk_files > 0 || b.options.everything)
        ? <Button kind="primary" className="flex-1" onClick={b.openPlan}>{risk.plan}</Button> : null
      second = <Button className={main ? '' : 'flex-1'} onClick={() => b.startScan()}>{risk.again}</Button>
      break
    case 'plan':
      body = <PlanList plan={plan} options={b.options} onToggle={b.toggle} onOptions={b.setOptions} />
      main = <Button kind="primary" className="flex-1" disabled={b.busy || !plan?.items.length}
        onClick={() => b.setStep('space')}>{planCopy.space}</Button>
      second = <Button onClick={() => b.setStep('risk')}>Back</Button>
      break
    case 'space':
      body = <SpaceCard plan={plan} policy={b.policy} options={b.options} tried={b.tried} progress={b.progress}
        onLeaveOut={b.leaveOutBiggest} onOptions={b.setOptions} />
      main = <Button kind="primary" className="flex-1" disabled={!ready || b.busy || blocked} onClick={b.copy}>
        {spaceCopy.copy(gb(plan?.bytes ?? 0))}</Button>
      second = <Button onClick={() => b.setStep('plan')}>Back</Button>
      break
    case 'copy':
      body = <CopyCard plan={plan} progress={b.progress} />
      main = <Button className="flex-1" onClick={() => setStopping(true)}>Stop copy</Button>
      break
    case 'done': {
      const bad = (b.result?.mismatches ?? 0) > 0
      body = <DoneCard cluster={id} result={b.result} onWeekly={() => setRemind('on')} />
      main = bad
        ? <Button kind="primary" className="flex-1" onClick={() => b.setStep('space')}>{doneCopy.again}</Button>
        : <Button kind="primary" className="flex-1" onClick={() => go('files',
            { cluster: id, path: (b.result?.notes_path ?? '').replace(/\/[^/]*$/, '') })}>{doneCopy.open}</Button>
      break
    }
  }

  return (
    <>
      <Header title={start.title}>
        <button aria-label={b.reminders?.enabled ? 'Weekly check, on' : 'Weekly check'} onClick={() => setRemind('open')}
          className="relative grid size-12 place-items-center rounded-full active:bg-pressed"><BellRing size={22} />
          {b.reminders?.enabled && <span className="absolute top-3 right-3 size-2 rounded-full bg-text" />}</button>
      </Header>
      <div className="order-2 min-h-0 flex-1 overflow-y-auto pb-6">
        {b.error && <p className="px-4 pb-3 text-bad">{b.error}</p>}
        {body}
      </div>
      {(main || second) && (
        <footer className="order-3 flex shrink-0 gap-3 border-t border-line bg-window px-4 py-3">{second}{main}</footer>
      )}
      {stopping && <ConfirmSheet title={copying.stopTitle} text={copying.stopText} keep={copying.keep}
        confirm="Stop copy" danger onConfirm={b.stopCopy} onClose={() => setStopping(false)} />}
      {remind && <RemindersSheet value={remind === 'on' && b.reminders ? { ...b.reminders, enabled: true } : b.reminders}
        onClose={() => setRemind('')} onSave={(r) => { b.setReminders(r); setRemind('') }} />}
    </>
  )
}

function RemindersSheet({ value, onSave, onClose }:
  { value: Reminders | null; onSave: (r: Reminders) => void; onClose: () => void }) {
  const [r, setR] = useState<Reminders>(value ?? { enabled: true, days: [1], time: '03:00', horizon_days: 7 })
  const [picking, setPicking] = useState<'' | 'day' | 'horizon'>('')
  const day = r.days[0] ?? 1
  return (
    <Sheet title={remindCopy.title} onClose={onClose} flush
      actions={<Button kind="primary" className="h-[52px] flex-1 text-base" onClick={() => onSave(r)}>
        {remindCopy.save}</Button>}>
      <List>
        <ToggleRow label={remindCopy.weekly} sub={phone.weeklyHint} checked={r.enabled}
          onChange={(enabled) => setR({ ...r, enabled })} />
        {r.enabled && <>
          <Row label={remindCopy.day} value={DAYS[day - 1]} opens onPress={() => setPicking('day')} />
          <label className="flex min-h-14 items-center gap-3 border-b border-line px-4 py-2">
            <span className="flex-1">{remindCopy.time}</span>
            <input type="time" aria-label={remindCopy.time} value={r.time}
              onChange={(e) => setR({ ...r, time: e.target.value })}
              className="h-12 rounded-lg border border-line-strong bg-window px-3 text-base tabular-nums" />
          </label>
          <Row label="Warn me" value={`${r.horizon_days} days ahead`} opens onPress={() => setPicking('horizon')} />
        </>}
      </List>
      {picking === 'day' && <PickerSheet title={remindCopy.day} value={String(day)} onClose={() => setPicking('')}
        onPick={(v) => setR({ ...r, days: [Number(v)] })}
        options={DAYS.map((d, i) => ({ value: String(i + 1), label: d }))} />}
      {picking === 'horizon' && <PickerSheet title="Warn me" value={String(r.horizon_days)} onClose={() => setPicking('')}
        onPick={(v) => setR({ ...r, horizon_days: Number(v) })}
        options={HORIZONS.map((d) => ({ value: String(d), label: remindCopy.horizon(d) }))} />}
    </Sheet>
  )
}
