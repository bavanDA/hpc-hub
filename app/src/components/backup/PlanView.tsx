// The plan on the desktop: what is kept and what is left out, a switch per row with the reason in plain words, the
// two plan switches, then Check space.
import { Bot, UserRound } from 'lucide-react'

import type { Plan, PlanItem } from '../../types/backup'
import { Button, Card, Pill, Spinner, Switch } from '../ui'
import { CLASS, count, gb, plan as copy } from './copy'
import type { Options } from './useBackup'

export function By({ by }: { by: string }) {
  if (by === 'agent') return <Pill kind="info" dot={false}><Bot size={12} />{copy.by.agent}</Pill>
  if (by === 'you') return <Pill kind="neutral" dot={false}><UserRound size={12} />{copy.by.you}</Pill>
  return null
}

function Item({ i, busy, onToggle }: { i: PlanItem; busy: boolean; onToggle: (keep: boolean) => void }) {
  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-mono text-sm">{i.folder}</span>
          <span className="text-sm font-semibold">{CLASS[i.kind]}</span>
          <By by={i.by} />
        </div>
        <div className="text-sm text-dim">{i.why}</div>
      </div>
      <span className="w-20 shrink-0 text-right text-sm tabular-nums text-dim">{gb(i.bytes)}</span>
      <Switch on={i.keep} disabled={busy} label={`${i.keep ? copy.leave : copy.keep}: ${i.folder}`}
        onChange={onToggle} />
    </div>
  )
}

export function PlanView({ plan, options, busy, onToggle, onOptions, onNext }: {
  plan: Plan | null; options: Options; busy: boolean; onToggle: (i: PlanItem, keep: boolean) => void
  onOptions: (o: Partial<Options>) => void; onNext: () => void
}) {
  if (!plan) return <div className="grid h-40 place-items-center"><Spinner size={20} /></div>
  const section = (title: string, items: PlanItem[], empty: string, total?: string) => (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline gap-3 px-1">
        <h3 className="text-md font-semibold">{title}</h3>
        {total && <span className="text-sm text-dim tabular-nums">{total}</span>}
      </div>
      <Card className="divide-y divide-line overflow-hidden">
        {items.length ? items.map((i) => <Item key={`${i.folder}|${i.kind}`} i={i} busy={busy}
          onToggle={(keep) => onToggle(i, keep)} />)
          : <p className="px-4 py-4 text-sm text-dim">{empty}</p>}
      </Card>
    </section>
  )
  return (
    <div className="flex flex-col gap-6">
      {plan.agent_summary && (
        <p className="flex items-start gap-2 rounded-lg bg-accent-soft p-3 text-md">
          <Bot size={16} className="mt-1 shrink-0 text-accent-text" />{plan.agent_summary}
        </p>
      )}
      {section(copy.keep, plan.items, copy.empty, `${count(plan.files)} files, ${plan.exact ? '' : 'about '}${gb(plan.bytes)}`)}
      {section(copy.leave, plan.left_out, copy.leftEmpty)}
      <Card className="divide-y divide-line">
        <label className="flex min-h-14 items-center gap-3 px-4 py-2">
          <span className="flex-1"><span className="block">{copy.whole}</span>
            <span className="text-sm text-dim">{copy.wholeHint}</span></span>
          <Switch on={options.whole} disabled={busy} onChange={(whole) => onOptions({ whole })} label={copy.whole} />
        </label>
        <label className="flex min-h-14 items-center gap-3 px-4 py-2">
          <span className="flex-1"><span className="block">{copy.onlySoon(options.horizon)}</span>
            <span className="text-sm text-dim">{copy.onlySoonHint}</span></span>
          <Switch on={!options.everything} disabled={busy} label={copy.onlySoon(options.horizon)}
            onChange={(on) => onOptions({ everything: !on })} />
        </label>
      </Card>
      <div className="flex items-center gap-3">
        <Button kind="primary" size="lg" disabled={busy || !plan.items.length} onClick={onNext}>{copy.space}</Button>
        {busy && <Spinner />}
      </div>
    </div>
  )
}
