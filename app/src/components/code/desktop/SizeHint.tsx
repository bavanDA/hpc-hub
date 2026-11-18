import type { SizeAdvice, SizeFix } from '../../../types/jobs'
import { Button } from '../../ui/Button'

/** The advice over the editor, each with its one-click fix. */
export function SizeHint({ advice, onFix }: { advice: SizeAdvice[]; onFix: (fix: SizeFix) => void }) {
  if (!advice.length) return null
  return (
    <div role="status" className={`flex shrink-0 flex-col gap-1 border-b border-line px-4 py-1.5 text-sm
      ${advice.some((a) => a.strict) ? 'bg-warn-bg' : 'bg-soft'}`}>
      {advice.map((a) => (
        <div key={a.kind} className="flex items-center gap-2">
          <p className={`min-w-0 flex-1 ${a.strict ? 'text-warn' : ''}`}>{a.text}</p>
          {a.fix && a.label && <Button size="sm" onClick={() => onFix(a.fix as SizeFix)}>{a.label}</Button>}
        </div>
      ))}
    </div>
  )
}
