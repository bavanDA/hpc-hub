// The backup agent's steps on the phone: one column, rows big enough to tap, the step's main button at the bottom
// of the screen (screens/Backup.tsx puts it there). The flow, words and the at-risk grouping are the desktop's
// (@shared/components/backup).
import { Bot, CircleAlert, CircleCheck, Clock, FileText, GitBranch, ShieldCheck, TimerOff } from 'lucide-react'

import {
  CLASS, count, done as doneCopy, gb, gbOf, helpFor, plan as planCopy, risk, scanning, space as spaceCopy, start,
  when,
} from '@shared/components/backup/copy'
import { groupsOf } from '@shared/components/backup/Risk'
import { spaceFacts } from '@shared/components/backup/SpaceView'
import type { Options } from '@shared/components/backup/useBackup'
import { Meter, Spinner } from '@shared/components/ui'
import type { BackupPolicy, CopyResult, Plan, PlanItem, Progress, Scan, Summary } from '@shared/types/backup'
import { Card, Switch } from '../../ui'

function Note({ bad = false, children }: { bad?: boolean; children: React.ReactNode }) {
  return (
    <p className={`flex items-start gap-2 rounded-xl p-3 text-sm ${bad ? 'bg-bad-bg text-bad' : 'bg-warn-bg text-warn'}`}>
      <CircleAlert size={18} className="mt-0.5 shrink-0" />{children}</p>
  )
}

export function StartView({ name, policy, agent, onAgent, onLast }: {
  name: string; policy: BackupPolicy | null; agent: boolean; onAgent: (on: boolean) => void; onLast?: () => void
}) {
  const noTimer = !!policy && policy.purge.days <= 0
  const Icon = noTimer ? TimerOff : ShieldCheck
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <div className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent-text"><Icon size={26} /></div>
        <p className="text-base">{!policy ? <Spinner /> : noTimer ? start.noTimer(name) : start.intro(name, policy.purge.days)}</p>
      </Card>
      <Card className="py-1">
        <Switch label={start.agent} hint={start.agentHint} checked={agent} onChange={onAgent} />
      </Card>
      <p className="px-1 text-sm text-dim">{start.hint}</p>
      {onLast && <button onClick={onLast} className="min-h-12 self-start rounded-xl px-1 font-bold text-accent-text
        active:bg-hover">{start.seeLast}</button>}
    </div>
  )
}

export function ScanView({ scan }: { scan: Scan | null }) {
  const p = scan?.progress ?? {}
  const failed = scan?.state === 'failed'
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">{!failed && <Spinner size={22} />}
        <h2 className="text-lg font-bold">{failed ? scanning.failed : scanning.title}</h2></div>
      <p className="text-dim">{scan?.detail || 'Waiting for a node'}</p>
      {scan?.state === 'scanning' && p.expected ? (
        <>
          <Meter value={(p.checked ?? 0) / p.expected} label="Files checked" />
          <span className="text-sm text-dim tabular-nums">{count(p.checked ?? 0)} of about {count(p.expected)}</span>
        </>
      ) : null}
      <p className="text-sm text-dim">{start.hint}</p>
    </Card>
  )
}

export function RiskView({ s, name, noTricks }: { s: Summary; name: string; noTricks: string }) {
  const folders = s.folders.filter((f) => f.at_risk_files > 0).length
  const full = s.purge.sooner_when_full_pct && s.scratch_fill_pct >= s.purge.sooner_when_full_pct - 10
  return (
    <div className="flex flex-col gap-4">
      <div className="px-1">
        <h2 className="text-xl font-bold">{risk.headline(s.at_risk_files, s.horizon_days)}</h2>
        {s.at_risk_files > 0 && <p className="mt-1 text-dim">{risk.sub(s.at_risk_bytes, folders, s.soonest_days)}</p>}
      </div>
      {full ? <Note>{risk.full(s.scratch_fill_pct, name, s.purge.days)}</Note> : null}
      {s.partial && <Note>{risk.partial}</Note>}
      {groupsOf(s).map((g) => (
        <section key={g.title} className="flex flex-col gap-2">
          <h3 className="px-1 text-sm font-bold text-dim">{g.title} · {count(g.files)} files, {gb(g.bytes)}</h3>
          <Card className="divide-y divide-line py-0">
            {g.folders.map((f) => (
              <div key={f.path} className="flex min-h-14 flex-col justify-center py-2">
                <span className="flex items-center gap-2 font-mono text-sm">
                  <span className="truncate">{f.path}</span>
                  {f.git && <GitBranch size={14} className="shrink-0 text-dim" />}
                </span>
                <span className="text-sm text-dim">{CLASS[f.kind]} · {gb(f.at_risk_bytes)}
                  {f.soonest_days != null ? ` · goes ${when(f.soonest_days)}` : ''}</span>
                {f.busy && <span className="text-sm text-dim">{risk.busy}</span>}
              </div>
            ))}
          </Card>
        </section>
      ))}
      {!s.at_risk_files && <p className="px-1 text-dim">{risk.nothing}</p>}
      <p className="flex items-start gap-2 px-1 text-sm text-dim"><Clock size={16} className="mt-0.5 shrink-0" />
        {risk.basis(name, s.purge)}</p>
      <p className="px-1 text-sm text-dim">{noTricks}</p>
    </div>
  )
}

function Row({ i, onToggle }: { i: PlanItem; onToggle: (keep: boolean) => void }) {
  const by = planCopy.by[i.by]
  return (
    <Switch checked={i.keep} onChange={onToggle}
      label={`${i.folder} · ${CLASS[i.kind]}${by ? ` · ${by}` : ''}`}
      hint={`${gb(i.bytes)}. ${i.why}`} />
  )
}

export function PlanList({ plan, options, onToggle, onOptions }: {
  plan: Plan | null; options: Options; onToggle: (i: PlanItem, keep: boolean) => void
  onOptions: (o: Partial<Options>) => void
}) {
  if (!plan) return <div className="grid h-40 place-items-center"><Spinner size={28} /></div>
  return (
    <div className="flex flex-col gap-4">
      {plan.agent_summary && <p className="flex items-start gap-2 rounded-xl bg-accent-soft p-3">
        <Bot size={18} className="mt-0.5 shrink-0 text-accent-text" />{plan.agent_summary}</p>}
      <h3 className="px-1 text-sm font-bold text-dim">{planCopy.keep} · {count(plan.files)} files, {plan.exact ? '' : 'about '}{gb(plan.bytes)}</h3>
      <Card className="divide-y divide-line py-0">
        {plan.items.length ? plan.items.map((i) => <Row key={`${i.folder}|${i.kind}`} i={i}
          onToggle={(k) => onToggle(i, k)} />) : <p className="py-4 text-dim">{planCopy.empty}</p>}
      </Card>
      <h3 className="px-1 text-sm font-bold text-dim">{planCopy.leave}</h3>
      <Card className="divide-y divide-line py-0">
        {plan.left_out.length ? plan.left_out.map((i) => <Row key={`${i.folder}|${i.kind}`} i={i}
          onToggle={(k) => onToggle(i, k)} />) : <p className="py-4 text-dim">{planCopy.leftEmpty}</p>}
      </Card>
      <Card className="divide-y divide-line py-0">
        <Switch label={planCopy.whole} hint={planCopy.wholeHint} checked={options.whole}
          onChange={(whole) => onOptions({ whole })} />
        <Switch label={planCopy.onlySoon(options.horizon)} hint={planCopy.onlySoonHint} checked={!options.everything}
          onChange={(on) => onOptions({ everything: !on })} />
      </Card>
    </div>
  )
}

export function SpaceCard({ plan, policy, options, tried, progress, onLeaveOut, onOptions }: {
  plan: Plan | null; policy: BackupPolicy | null; options: Options; tried: string; progress: Progress | null
  onLeaveOut: () => void; onOptions: (o: Partial<Options>) => void
}) {
  if (!plan) return <div className="grid h-40 place-items-center"><Spinner size={28} /></div>
  const f = spaceFacts(plan, policy)
  const s = f.s
  const ready = plan.exact && tried === 'yes'
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-2">
        <p>{spaceCopy.uses(gb(plan.bytes), plan.exact)}</p>
        {s.quota_gb > 0 ? <>
          <Meter value={s.after_gb / s.quota_gb} label="Project after the copy" />
          <p className="text-sm text-dim tabular-nums">{spaceCopy.after(gbOf(s.after_gb), gbOf(s.quota_gb), s.pct_after)}</p>
        </> : <p className="text-sm text-dim">{spaceCopy.noQuota(gbOf(s.after_gb))}</p>}
        {(f.dest?.shared_with ?? 0) > 1 && <p className="text-sm text-dim">{spaceCopy.shared(f.dest!.shared_with)}</p>}
        <p className="text-sm text-dim break-all">{spaceCopy.where(plan.dest)}</p>
      </Card>
      {f.warn && <Note>{s.warn}</Note>}
      {f.blocked && <>
        <Note bad>{s.warn}</Note>
        <button onClick={onLeaveOut} className="min-h-12 rounded-xl bg-pill px-4 font-bold active:bg-selected">
          {spaceCopy.leaveBiggest}</button>
      </>}
      {f.tooManyFiles && <Note>{spaceCopy.files(f.adds, s.file_limit, s.files_after - f.adds)}</Note>}
      {f.offerHome && <Card className="py-1"><Switch label={spaceCopy.homeCode} hint={spaceCopy.homeCodeHint}
        checked={options.codeToHome} onChange={(codeToHome) => onOptions({ codeToHome })} /></Card>}
      {ready ? (
        <Card className="flex flex-col gap-1">
          <p className="flex items-center gap-2 font-bold"><CircleCheck size={20} className="text-ok" />
            {spaceCopy.ready(plan.files, gb(plan.bytes))}</p>
          <p className="text-sm text-dim">{spaceCopy.replaced(plan.will_replace ?? 0)}</p>
          {(plan.busy?.length ?? 0) > 0 && <p className="text-sm text-dim">{spaceCopy.busy(plan.busy!.length)}</p>}
        </Card>
      ) : tried === 'running'
        ? <p className="flex items-center gap-2 px-1 text-dim"><Spinner />{progress?.detail || spaceCopy.trying}</p>
        : <p className="px-1 text-sm text-dim">{spaceCopy.tryHint}</p>}
    </div>
  )
}

export function CopyCard({ plan, progress, job }: { plan: Plan | null; progress: Progress | null; job: string }) {
  const total = progress?.total_bytes || plan?.bytes || 0
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3"><Spinner size={22} />
        <h2 className="text-lg font-bold">Copying {gb(total)} to project</h2></div>
      <Meter value={total ? (progress?.done_bytes ?? 0) / total : 0} label="Copied" />
      <p className="text-dim tabular-nums">{progress?.state === 'verifying'
        ? 'Checking every file against the one in scratch' : progress?.detail || 'Starting'}</p>
      {job && <p className="text-sm text-dim">Runs as job {job}. You can close the app.</p>}
    </Card>
  )
}

export function DoneCard({ cluster, result }: { cluster: string; result: CopyResult | null }) {
  if (!result) return <div className="grid h-40 place-items-center"><Spinner size={28} /></div>
  const busy = result.busy.length
  const failed = result.failed.length
  const bad = result.mismatches > 0
  const partial = busy + failed > 0
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <div className={`grid size-14 place-items-center rounded-2xl ${bad ? 'bg-pill text-dim' : 'bg-ok-bg text-ok'}`}>
          {bad ? <CircleAlert size={26} /> : <CircleCheck size={26} />}</div>
        <h2 className="text-xl font-bold">{bad ? doneCopy.mismatch(result.mismatches)
          : partial ? doneCopy.partial(result.copied_files, result.copied_files + busy + failed)
            : doneCopy.title(result.copied_files)}</h2>
        <p className="text-dim">{bad ? doneCopy.mismatchHelp(helpFor(cluster)) : doneCopy.checked(result.verified)}</p>
        {busy > 0 && <p className="text-dim">{doneCopy.busy(busy)}</p>}
        {failed > 0 && <p className="text-dim">{doneCopy.failed(failed)}</p>}
        {result.notes_path && <p className="flex items-start gap-2 text-sm text-dim"><FileText size={16} className="mt-0.5 shrink-0" />
          <span>{doneCopy.notes} <span className="font-mono">{result.notes_path.split('/').slice(-2).join('/')}</span></span></p>}
      </Card>
      {partial && (
        <Card className="divide-y divide-line py-0">
          {[...result.busy.map((p) => [p, 'Busy']), ...result.failed.map((f) => [f.path, f.why])].map(([p, why]) => (
            <div key={p} className="flex min-h-12 flex-col justify-center py-2">
              <span className="truncate font-mono text-sm">{p}</span><span className="text-sm text-dim">{why}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
