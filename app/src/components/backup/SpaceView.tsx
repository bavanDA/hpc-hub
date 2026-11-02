// Space and the trial run on the desktop: how much of project the copy uses, warnings, the way out when it does not
// fit, then Try it first and Copy.
import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import { useEffect, useRef } from 'react'

import type { BackupPolicy, Plan, Progress } from '../../types/backup'
import { Button, Card, Meter, Spinner, Switch } from '../ui'
import { gb, gbOf, space as copy } from './copy'
import type { Options } from './useBackup'

/** The space facts and the trial run state, worked out once for both screens. */
export function spaceFacts(plan: Plan, policy: BackupPolicy | null) {
  const s = plan.space
  const dest = policy?.destinations.find((d) => plan.dest.startsWith(d.path)) ?? policy?.destinations[0]
  const home = policy?.destinations.find((d) => d.backed_up && d !== dest && /home/i.test(d.label))
  const adds = Math.max(0, s.files_after - (dest?.files ?? s.files_after - plan.files))
  return {
    s, dest, adds,
    offerHome: !!dest && !dest.backed_up && !!home,
    tooManyFiles: s.file_limit > 0 && s.files_after > s.file_limit * 0.9,
    blocked: !s.fits,
    warn: s.fits && !!s.warn,
  }
}

export function SpaceView({ plan, policy, options, tried, progress, busy, onLeaveOut, onOptions, onTry, onCopy,
  onBack }: {
  plan: Plan | null; policy: BackupPolicy | null; options: Options; tried: string; progress: Progress | null
  busy: boolean; onLeaveOut: () => void; onOptions: (o: Partial<Options>) => void; onTry: () => void
  onCopy: () => void; onBack: () => void
}) {
  // the trial run starts by itself, once per plan; Try again only after it failed
  const asked = useRef<Plan | null>(null)
  const blocked = plan ? !plan.space.fits : true
  useEffect(() => {
    if (!plan || busy || blocked || tried === 'yes' || tried === 'running' || asked.current === plan) return
    asked.current = plan
    onTry()
  }, [plan, busy, blocked, tried, onTry])
  if (!plan) return <div className="grid h-40 place-items-center"><Spinner size={20} /></div>
  const f = spaceFacts(plan, policy)
  const s = f.s
  const ready = plan.exact && tried === 'yes'
  const trying = tried === 'running'
  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-3 p-5">
        <p className="text-md">{copy.uses(gb(plan.bytes), plan.exact)}</p>
        {s.quota_gb > 0 ? (
          <>
            <Meter value={s.after_gb / s.quota_gb} label="Project after the copy" />
            <p className="text-sm text-dim tabular-nums">{copy.after(gbOf(s.after_gb), gbOf(s.quota_gb), s.pct_after)}</p>
          </>
        ) : <p className="text-sm text-dim">{copy.noQuota(gbOf(s.after_gb))}</p>}
        {(f.dest?.shared_with ?? 0) > 1 && <p className="text-sm text-dim">{copy.shared(f.dest!.shared_with)}</p>}
        <p className="text-sm text-dim">{copy.where(plan.dest)}</p>
      </Card>

      {f.warn && <Note kind="warn">{s.warn}</Note>}
      {f.blocked && (
        <Note kind="bad" action={<Button onClick={onLeaveOut} disabled={busy}>{copy.leaveBiggest}</Button>}>
          {s.warn}
        </Note>
      )}
      {f.tooManyFiles && <Note kind="warn">{copy.files(f.adds, s.file_limit, s.files_after - f.adds)}</Note>}
      {f.offerHome && (
        <Card className="flex items-center gap-3 px-4 py-3">
          <span className="flex-1"><span className="block">{copy.homeCode}</span>
            <span className="text-sm text-dim">{copy.homeCodeHint}</span></span>
          <Switch on={options.codeToHome} disabled={busy} label={copy.homeCode}
            onChange={(codeToHome) => onOptions({ codeToHome })} />
        </Card>
      )}

      {ready ? (
        <Card className="flex flex-col gap-2 p-5">
          <p className="flex items-center gap-2 text-md font-semibold">
            <CircleCheck size={18} className="text-ok" />{copy.ready(plan.files, gb(plan.bytes))}
          </p>
          <p className="text-sm text-dim">{copy.replaced(plan.will_replace ?? 0)}</p>
          {(plan.busy?.length ?? 0) > 0 && <p className="text-sm text-dim">{copy.busy(plan.busy!.length)}</p>}
        </Card>
      ) : trying ? (
        <p className="flex items-center gap-2 text-md text-dim"><Spinner />{progress?.detail || copy.trying}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button kind="ghost" onClick={onBack}>{copy.back}</Button>
        <span className="flex-1" />
        {ready ? <Button kind="primary" size="lg" disabled={busy || f.blocked} onClick={onCopy}>
          {copy.copy(gb(plan.bytes))}</Button>
          : trying || f.blocked ? <Button kind="primary" size="lg" disabled>{copy.copy(gb(plan.bytes))}</Button>
            : <Button kind="primary" size="lg" disabled={busy} onClick={onTry}>{copy.retry}</Button>}
      </div>
    </div>
  )
}

export function Note({ kind, children, action }: { kind: 'warn' | 'bad' | 'info'; children: React.ReactNode
  action?: React.ReactNode }) {
  const look = kind === 'bad' ? 'bg-bad-bg text-bad' : kind === 'warn' ? 'bg-warn-bg text-warn'
    : 'bg-accent-soft text-text'
  const Icon = kind === 'info' ? Info : CircleAlert
  return (
    <div className={`flex flex-col gap-3 rounded-lg p-3 ${look}`}>
      <p className="flex items-start gap-2 text-md"><Icon size={16} className="mt-1 shrink-0" />{children}</p>
      {action && <div>{action}</div>}
    </div>
  )
}

