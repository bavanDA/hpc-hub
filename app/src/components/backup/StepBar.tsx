import type { Step } from './flow'

const STEPS: [Step[], string][] = [[['start', 'scanning'], 'Check'], [['risk'], 'At risk'], [['plan'], 'Plan'],
  [['space'], 'Space'], [['copy', 'done'], 'Copy']]

export function StepBar({ step }: { step: Step }) {
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
