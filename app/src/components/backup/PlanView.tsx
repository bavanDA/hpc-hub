import type { Plan, PlanItem } from '../../types/backup'
import { agentIcon } from '../agents/AgentIcon'
import { EButton, IconToggleRow } from '../e/extra'
import { Section } from '../e/ui'
import { Spinner } from '../ui'
import { CLASS, count, gb, plan as copy } from './copy'
import { Actions } from './Steps'
import type { Options } from './useBackup'

const Claude = agentIcon('claude')

/** A plan's items grouped by folder: the folder once, a switch for each kind of file in it. */
function Items({ items, busy, onToggle }:
  { items: PlanItem[]; busy: boolean; onToggle: (i: PlanItem, keep: boolean) => void }) {
  const folders = [...new Set(items.map((i) => i.folder))]
  return folders.map((folder) => {
    const mine = items.filter((i) => i.folder === folder)
    return (
      <div key={folder}>
        <p className="px-5 pt-3 pb-1 font-mono text-sm break-all">{folder}</p>
        {mine.map((i, n) => {
          const why = n && mine[n - 1].why === i.why ? '' : i.why
          const by = copy.by[i.by]
          return <IconToggleRow key={i.kind} label={CLASS[i.kind]} checked={i.keep} disabled={busy}
            onChange={(k) => onToggle(i, k)}
            sub={[`${count(i.files)} ${i.files === 1 ? 'file' : 'files'}, ${gb(i.bytes)}`,
              why && (by ? `${by}: ${why}` : why)].filter(Boolean).join(' · ')} />
        })}
      </div>
    )
  })
}

export function PlanView({ plan, options, busy, onToggle, onOptions, onNext, onBack }: {
  plan: Plan | null; options: Options; busy: boolean; onToggle: (i: PlanItem, keep: boolean) => void
  onOptions: (o: Partial<Options>) => void; onNext: () => void; onBack: () => void
}) {
  if (!plan) return <div className="grid h-40 place-items-center"><Spinner size={20} /></div>
  return (
    <>
      {plan.agent_summary && <p className="flex items-start gap-3 px-5 text-md">
        <Claude size={18} className="mt-0.5 shrink-0" />{plan.agent_summary}</p>}
      <Section title={`${copy.keep} · ${count(plan.files)} files, ${plan.exact ? '' : 'about '}${gb(plan.bytes)}`}>
        {plan.items.length ? <Items items={plan.items} busy={busy} onToggle={onToggle} />
          : <p className="border-b border-line px-5 py-3 text-dim">{copy.empty}</p>}
      </Section>
      <Section title={copy.leave}>
        {plan.left_out.length ? <Items items={plan.left_out} busy={busy} onToggle={onToggle} />
          : <p className="border-b border-line px-5 py-3 text-dim">{copy.leftEmpty}</p>}
      </Section>
      <Section>
        <IconToggleRow label={copy.whole} sub={copy.wholeHint} checked={options.whole} disabled={busy}
          onChange={(whole) => onOptions({ whole })} />
        <IconToggleRow label={copy.onlySoon(options.horizon)} checked={!options.everything} disabled={busy}
          sub={options.everything ? copy.onlySoonHint : undefined} onChange={(on) => onOptions({ everything: !on })} />
      </Section>
      <Actions>
        <EButton onClick={onBack}>Back</EButton>
        <EButton kind="primary" disabled={busy || !plan.items.length} onClick={onNext}>{copy.space}</EButton>
        {busy && <Spinner />}
      </Actions>
    </>
  )
}
