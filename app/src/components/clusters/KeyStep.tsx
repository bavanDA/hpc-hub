import { Check } from 'lucide-react'
import type { ReactNode } from 'react'

/** One step: a number (a check once done), its title, and its content only while it is the open one. */
export function KeyStep({ n, state, title, done, change, onOpen, last, children }: {
  n: number; state: 'done' | 'open' | 'later'; title: string; done: string; change?: string; onOpen?: () => void
  last?: boolean; children: ReactNode
}) {
  const mark = state === 'done' ? 'border-[1.5px] border-line-strong text-text'
    : state === 'open' ? 'bg-accent text-on-accent' : 'border-[1.5px] border-line-strong text-dim'
  return (
    <div className="flex gap-4 py-3">
      <div className="flex flex-col items-center">
        <span className={`grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold ${mark}`}>
          {state === 'done' ? <Check size={16} strokeWidth={2.5} /> : n}</span>
        {!last && <span className="mt-1 -mb-3 w-px flex-1 bg-line" />}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-baseline gap-3">
          <div className={`min-w-0 flex-1 ${state === 'open' ? 'font-semibold' : state === 'later' ? 'text-dim' : ''}`}>
            {title}</div>
          {state === 'done' && onOpen && change && <button type="button" onClick={onOpen}
            className="-my-1 rounded-md px-2 py-1 font-semibold underline-offset-2 hover:underline">{change}</button>}
        </div>
        {state === 'done' && done && <div className="text-sm text-dim">{done}</div>}
        {state === 'open' && <div className="mt-3 flex flex-col gap-3 pb-1">{children}</div>}
      </div>
    </div>
  )
}
