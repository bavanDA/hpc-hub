import type { ReactNode } from 'react'

import { Spinner } from '../ui/Spinner'
import type { Entry } from './lookUp'

/** Meanings of an entry, a part of speech at a time, with examples; loading and not found too. */
export function Meanings({ entry, pad = 'px-5' }: { entry: Entry | null; pad?: string }): ReactNode {
  if (!entry) {
    return <p className={`flex items-center gap-2 border-t border-line ${pad} py-4 text-dim`}>
      <Spinner size={16} />Looking it up…</p>
  }
  if (entry.error) return <p className={`border-t border-line ${pad} py-4 text-dim`}>{entry.error}</p>
  return (
    <>
      {entry.meanings?.map((m, i) => (
        <section key={i} className={`border-t border-line ${pad} py-4`}>
          {m.pos && <h3 className="pb-2 text-xs font-semibold tracking-wide text-dim uppercase">{m.pos}</h3>}
          <ol className="flex flex-col gap-3">
            {m.senses.map((s, j) => (
              <li key={j} className="flex gap-2.5">
                <span className="w-4 shrink-0 text-right tabular-nums text-dim">{j + 1}</span>
                <div className="min-w-0 flex-1 break-words">
                  <p>{s.definition}</p>
                  {s.example && <p className="mt-1 text-dim">"{s.example}"</p>}
                  {s.synonyms.length > 0 && <p className="mt-1 text-sm text-dim">Similar: {s.synonyms.join(', ')}</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {entry.source && <p className={`border-t border-line ${pad} py-3 text-xs text-dim`}>From {entry.source}</p>}
    </>
  )
}
