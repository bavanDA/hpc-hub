// The backup agent's steps on the phone, in rows: one column, the step's main button at the bottom of the screen
// (screens/Backup.tsx puts it there). The flow and the at-risk grouping are the desktop's (@shared/components/backup);
// the words that differ on the phone are in ./words.
import { CircleAlert, CircleCheck, FileText, GitBranch } from 'lucide-react'
import type { ReactNode } from 'react'

import { agentIcon } from '@shared/components/agents/AgentIcon'
import {
  CLASS, count, done as doneCopy, gb, gbOf, helpFor, plan as planCopy, risk, scanning, space as spaceCopy, start,
  when,
} from '@shared/components/backup/copy'
import { groupsOf } from '@shared/components/backup/Risk'
import { spaceFacts } from '@shared/components/backup/SpaceView'
import type { Options } from '@shared/components/backup/useBackup'
import { Spinner } from '@shared/components/ui'
import type { BackupPolicy, CopyResult, Plan, PlanItem, Progress, Scan, Summary } from '@shared/types/backup'
import { Button, List, Row, Section, ToggleRow } from '../../ui'
import { Bar } from '../usage/Bar'
import { copyLine, isGit, phone, reason, scanLine } from './words'

const Claude = agentIcon('claude')
const Loading = () => <div className="grid h-40 place-items-center"><Spinner size={28} /></div>

/** Something to know before going on: grey, red when it stops the step. */
function Note({ bad = false, children }: { bad?: boolean; children: ReactNode }) {
  return (
    <p className={`flex items-start gap-2 px-4 pt-3 text-sm ${bad ? 'text-bad' : 'text-dim'}`}>
      <CircleAlert size={18} className="mt-px shrink-0" />{children}</p>
  )
}

export function StartView({ name, policy, agent, onAgent, onLast }: {
  name: string; policy: BackupPolicy | null; agent: boolean; onAgent: (on: boolean) => void; onLast?: () => void
}) {
  const noTimer = !!policy && policy.purge.days <= 0
  return (
    <>
      <p className="px-4 pb-5 text-base">
        {!policy ? <Spinner /> : noTimer ? start.noTimer(name) : start.intro(name, policy.purge.days)}</p>
      <List>
        <div className="flex items-center border-b border-line pl-4 [&_label]:border-0 [&_label]:pl-3">
          <Claude size={22} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <ToggleRow label={phone.agent} sub={phone.agentHint} checked={agent} onChange={onAgent} />
          </div>
        </div>
        {onLast && <Row label={start.seeLast} opens onPress={onLast} />}
      </List>
      <p className="px-4 pt-3 text-sm text-dim">{phone.hint}</p>
    </>
  )
}

export function ScanView({ scan }: { scan: Scan | null }) {
  const p = scan?.progress ?? {}
  const failed = scan?.state === 'failed'
  return (
    <div className="flex flex-col gap-3 px-4">
      <h2 className="flex items-center gap-3 text-lg font-semibold">{!failed && <Spinner size={20} />}
        {failed ? scanning.failed : scanning.title}</h2>
      {scan?.state === 'scanning' && p.expected ? <Bar value={(p.checked ?? 0) / p.expected} label="Files checked" />
        : null}
      <p className="text-dim tabular-nums">{scanLine(scan)}</p>
      {!failed && <p className="text-sm text-dim">{phone.hint}</p>}
    </div>
  )
}

export function RiskView({ s, name }: { s: Summary; name: string }) {
  const folders = s.folders.filter((f) => f.at_risk_files > 0).length
  const full = s.purge.sooner_when_full_pct && s.scratch_fill_pct >= s.purge.sooner_when_full_pct - 10
  return (
    <>
      <div className="px-4">
        <h2 className="text-xl leading-snug font-semibold">{risk.headline(s.at_risk_files, s.horizon_days)}</h2>
        {s.at_risk_files > 0 && <p className="mt-1 text-dim">{risk.sub(s.at_risk_bytes, folders, s.soonest_days)}</p>}
        {!s.at_risk_files && <p className="mt-1 text-dim">{risk.nothing}</p>}
      </div>
      {full ? <Note>{risk.full(s.scratch_fill_pct, name, s.purge.days)}</Note> : null}
      {s.partial && <Note>{risk.partial}</Note>}
      {groupsOf(s).map((g) => (
        <Section key={g.title} title={`${g.title} · ${count(g.files)} files, ${gb(g.bytes)}`}>
          {g.folders.map((f) => (
            <Row key={f.path}
              label={<span className="flex items-center gap-2 font-mono text-sm">
                <span className="min-w-0 break-all">{f.path}</span>
                {f.git && <GitBranch size={14} aria-label="Git repo" className="shrink-0 text-dim" />}</span>}
              sub={[CLASS[f.kind], gb(f.at_risk_bytes), f.soonest_days != null ? `goes ${when(f.soonest_days)}` : '',
                f.busy ? risk.busy : ''].filter(Boolean).join(' · ')} />
          ))}
        </Section>
      ))}
    </>
  )
}

/** A plan's items grouped by folder: the folder once, a switch for each kind of file in it. */
function Items({ items, onToggle }: { items: PlanItem[]; onToggle: (i: PlanItem, keep: boolean) => void }) {
  const folders = [...new Set(items.map((i) => i.folder))]
  return folders.map((folder) => {
    const mine = items.filter((i) => i.folder === folder)
    return (
      <div key={folder}>
        <p className="px-4 pt-3 pb-1 text-sm">
          <span className="font-mono break-all">{folder}</span>
          {mine.every(isGit) && <span className="text-dim"> · {phone.git}</span>}</p>
        {mine.map((i) => {
          const why = reason(i)
          const by = planCopy.by[i.by]
          return <ToggleRow key={i.kind} label={CLASS[i.kind]} checked={i.keep} onChange={(k) => onToggle(i, k)}
            sub={[`${count(i.files)} ${i.files === 1 ? 'file' : 'files'}, ${gb(i.bytes)}`,
              why && (by ? `${by}: ${why}` : why)].filter(Boolean).join(' · ')} />
        })}
      </div>
    )
  })
}

export function PlanList({ plan, options, onToggle, onOptions }: {
  plan: Plan | null; options: Options; onToggle: (i: PlanItem, keep: boolean) => void
  onOptions: (o: Partial<Options>) => void
}) {
  if (!plan) return <Loading />
  return (
    <>
      {plan.agent_summary && <p className="flex items-start gap-3 px-4 pb-2">
        <Claude size={20} className="mt-0.5 shrink-0" />{plan.agent_summary}</p>}
      <Section title={`${planCopy.keep} · ${count(plan.files)} files, ${plan.exact ? '' : 'about '}${gb(plan.bytes)}`}>
        {plan.items.length ? <Items items={plan.items} onToggle={onToggle} />
          : <p className="border-b border-line px-4 py-3 text-dim">{planCopy.empty}</p>}
      </Section>
      <Section title={planCopy.leave}>
        {plan.left_out.length ? <Items items={plan.left_out} onToggle={onToggle} />
          : <p className="border-b border-line px-4 py-3 text-dim">{planCopy.leftEmpty}</p>}
      </Section>
      <Section>
        <ToggleRow label={planCopy.whole} checked={options.whole} onChange={(whole) => onOptions({ whole })} />
        <ToggleRow label={planCopy.onlySoon(options.horizon)} checked={!options.everything}
          sub={options.everything ? phone.onlySoonOff : phone.onlySoonOn}
          onChange={(on) => onOptions({ everything: !on })} />
      </Section>
    </>
  )
}

export function SpaceCard({ plan, policy, options, tried, progress, onLeaveOut, onOptions }: {
  plan: Plan | null; policy: BackupPolicy | null; options: Options; tried: string; progress: Progress | null
  onLeaveOut: () => void; onOptions: (o: Partial<Options>) => void
}) {
  if (!plan) return <Loading />
  const f = spaceFacts(plan, policy)
  const s = f.s
  const ready = plan.exact && tried === 'yes'
  const shared = f.dest?.shared_with ?? 0
  return (
    <>
      <List>
        <Row label="This copy" value={`${plan.exact ? '' : 'About '}${gb(plan.bytes)}`} />
        {s.quota_gb > 0
          ? <div className="border-b border-line px-4 py-2.5">
              <div className="flex min-h-9 items-center gap-3">
                <span className="flex-1">Project after</span>
                <span className="font-medium tabular-nums">{gbOf(s.after_gb)} of {gbOf(s.quota_gb)}</span>
              </div>
              <Bar value={s.after_gb / s.quota_gb} label="Project after the copy" className="my-1" />
              <p className="text-sm text-dim tabular-nums">{s.pct_after}% full{shared > 1 ? `, shared by ${shared} people`
                : ''}</p>
            </div>
          : <Row label="Project after" value={gbOf(s.after_gb)} />}
        <Row label="Goes to" sub={<span className="font-mono break-all">{plan.dest}</span>} />
      </List>
      {f.warn && <Note>{s.warn}</Note>}
      {f.blocked && <>
        <Note bad>{s.warn}</Note>
        <div className="px-4 pt-3"><Button className="w-full" onClick={onLeaveOut}>{spaceCopy.leaveBiggest}</Button></div>
      </>}
      {f.tooManyFiles && <Note>{phone.files(s.files_after, s.file_limit)}</Note>}
      {f.offerHome && <List className="mt-5">
        <ToggleRow label={spaceCopy.homeCode} sub={spaceCopy.homeCodeHint} checked={options.codeToHome}
          onChange={(codeToHome) => onOptions({ codeToHome })} />
      </List>}
      {ready ? (
        <div className="flex flex-col gap-1 px-4 pt-5">
          <p className="flex items-center gap-2 font-semibold"><CircleCheck size={20} className="shrink-0" />
            {phone.ready(plan.files)}</p>
          {(plan.will_replace ?? 0) > 0 && <p className="text-sm text-dim">{phone.replaced(plan.will_replace!)}</p>}
          {(plan.busy?.length ?? 0) > 0 && <p className="text-sm text-dim">{spaceCopy.busy(plan.busy!.length)}</p>}
        </div>
      ) : !f.blocked && <p className="flex items-center gap-2 px-4 pt-5 text-dim"><Spinner />
        {tried === 'running' && progress?.detail ? progress.detail : phone.checking}</p>}
    </>
  )
}

export function CopyCard({ plan, progress }: { plan: Plan | null; progress: Progress | null }) {
  const total = progress?.total_bytes || plan?.bytes || 0
  return (
    <div className="flex flex-col gap-3 px-4">
      <h2 className="flex items-center gap-3 text-lg font-semibold"><Spinner size={20} />
        Copying {gb(total)} to project</h2>
      <Bar value={total ? (progress?.done_bytes ?? 0) / total : 0} label="Copied" />
      <p className="text-dim tabular-nums">{copyLine(progress, total)}</p>
      <p className="text-sm text-dim">{phone.closeApp}</p>
    </div>
  )
}

export function DoneCard({ cluster, result }: { cluster: string; result: CopyResult | null }) {
  if (!result) return <Loading />
  const busy = result.busy.length
  const failed = result.failed.length
  const bad = result.mismatches > 0
  const partial = busy + failed > 0
  return (
    <>
      <div className="flex flex-col gap-2 px-4">
        <h2 className={`flex items-start gap-2 text-xl leading-snug font-semibold ${bad ? 'text-bad' : ''}`}>
          {bad ? <CircleAlert size={24} className="mt-0.5 shrink-0" /> : <CircleCheck size={24} className="mt-0.5 shrink-0" />}
          {bad ? doneCopy.mismatch(result.mismatches)
            : partial ? doneCopy.partial(result.copied_files, result.copied_files + busy + failed)
              : doneCopy.title(result.copied_files)}</h2>
        <p className="text-dim">{bad ? doneCopy.mismatchHelp(helpFor(cluster)) : doneCopy.checked(result.verified)}</p>
        {busy > 0 && <p className="text-dim">{doneCopy.busy(busy)}</p>}
        {failed > 0 && <p className="text-dim">{doneCopy.failed(failed)}</p>}
      </div>
      {result.notes_path && <List className="mt-5">
        <Row icon={FileText} label="Notes on what was copied"
          sub={<span className="font-mono break-all">{result.notes_path.split('/').slice(-2).join('/')}</span>} />
      </List>}
      {partial && <Section title="Not copied">
        {[...result.busy.map((p) => [p, 'A job was still writing it']), ...result.failed.map((x) => [x.path, x.why])].map(([p, why]) => (
          <Row key={p} label={<span className="font-mono text-sm break-all">{p}</span>} sub={why} />
        ))}
      </Section>}
    </>
  )
}
