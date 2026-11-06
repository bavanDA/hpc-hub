import type { Step } from './step'

export function Progress({ steps, at }: { steps: Step[]; at: number }) {
  const clusters = steps.filter((s) => s.kind === 'login')
  const which = clusters.findIndex((s) => s.cluster.id === steps[at].cluster.id) + 1
  return (
    <div className="flex items-center gap-3 px-5 text-sm text-dim">
      {clusters.length > 1 && <span>Cluster {which} of {clusters.length}</span>}
      <div className="flex flex-1 gap-1.5" aria-label={`Step ${at + 1} of ${steps.length}`}>
        {steps.map((_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i <= at ? 'bg-accent' : 'bg-line-strong'}`} />
        ))}
      </div>
    </div>
  )
}
