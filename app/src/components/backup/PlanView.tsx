import type { Plan, PlanItem } from '../../types/backup'
import { agentIcon } from '../agents/AgentIcon'
import { EButton } from '../e/EButton'
import { IconToggleRow } from '../e/IconToggleRow'
import { Section } from '../e/Section'
import { Spinner } from '../ui/Spinner'
import { Actions } from './Actions'
import { plan as copy } from './copy'
import type { Options } from './flow'
import { count, gb } from './format'
import { PlanItems } from './PlanItems'

const Claude = agentIcon('claude')

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
        {plan.items.length ? <PlanItems items={plan.items} busy={busy} onToggle={onToggle} />
          : <p className="border-b border-line px-5 py-3 text-dim">{copy.empty}</p>}
      </Section>
      <Section title={copy.leave}>
        {plan.left_out.length ? <PlanItems items={plan.left_out} busy={busy} onToggle={onToggle} />
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
