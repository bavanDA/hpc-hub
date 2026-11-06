import { CircleCheck } from 'lucide-react'
import { useEffect, useRef } from 'react'

import type { BackupPolicy, Plan, Progress } from '../../types/backup'
import { EButton, IconToggleRow, Note } from '../e/extra'
import { List, Row } from '../e/ui'
import { Meter, Spinner } from '../ui'
import { gb, gbOf, space as copy } from './copy'
import { spaceFacts } from './plan'
import { Actions } from './Steps'
import type { Options } from './useBackup'

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
  const shared = f.dest?.shared_with ?? 0
  return (
    <>
      <List>
        <Row label="This copy" value={`${plan.exact ? '' : 'About '}${gb(plan.bytes)}`} />
        {s.quota_gb > 0
          ? <div className="border-b border-line px-5 py-2.5">
              <div className="flex min-h-7 items-center gap-3">
                <span className="flex-1">Project after</span>
                <span className="font-medium tabular-nums">{gbOf(s.after_gb)} of {gbOf(s.quota_gb)}</span>
              </div>
              <Meter value={s.after_gb / s.quota_gb} label="Project after the copy" className="my-1.5" />
              <p className="text-sm text-dim tabular-nums">{s.pct_after}% full{shared > 1
                ? `, shared by ${shared} people` : ''}</p>
            </div>
          : <Row label="Project after" value={gbOf(s.after_gb)} />}
        <Row label="Goes to" sub={<span className="font-mono break-all">{plan.dest}</span>} />
      </List>
      {f.warn && <Note>{s.warn}</Note>}
      {f.blocked && <Note bad action={<EButton onClick={onLeaveOut} disabled={busy}>{copy.leaveBiggest}</EButton>}>
        {s.warn}</Note>}
      {f.tooManyFiles && <Note>{copy.files(f.adds, s.file_limit, s.files_after - f.adds)}</Note>}
      {f.offerHome && <div className="pt-5"><List>
        <IconToggleRow label={copy.homeCode} sub={copy.homeCodeHint} checked={options.codeToHome} disabled={busy}
          onChange={(codeToHome) => onOptions({ codeToHome })} />
      </List></div>}

      {ready ? (
        <div className="flex flex-col gap-1 px-5 pt-5">
          <p className="flex items-center gap-2 font-semibold"><CircleCheck size={18} className="shrink-0" />
            {copy.ready(plan.files, gb(plan.bytes))}</p>
          <p className="text-sm text-dim">{copy.replaced(plan.will_replace ?? 0)}</p>
          {(plan.busy?.length ?? 0) > 0 && <p className="text-sm text-dim">{copy.busy(plan.busy!.length)}</p>}
        </div>
      ) : trying ? (
        <p className="flex items-center gap-2 px-5 pt-5 text-dim"><Spinner />{progress?.detail || copy.trying}</p>
      ) : null}

      <Actions>
        <EButton onClick={onBack}>{copy.back}</EButton>
        {ready || trying || f.blocked
          ? <EButton kind="primary" disabled={!ready || busy || f.blocked} onClick={onCopy}>{copy.copy(gb(plan.bytes))}
            </EButton>
          : <EButton kind="primary" disabled={busy} onClick={onTry}>{copy.retry}</EButton>}
      </Actions>
    </>
  )
}
