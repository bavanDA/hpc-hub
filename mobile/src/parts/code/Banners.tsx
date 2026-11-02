// What the Code tab says above the editor about the open file: it changed on the cluster, an agent changed it,
// the cluster isn't connected, it can only be read, there are edits from earlier to restore, or a log ends in an
// error worth fixing. Each says what happened in one line and offers the next step.
import type { ReactNode } from 'react'

import { Button } from '../../ui'

export type BannerAction = { label: string; run: () => void; primary?: boolean }
export type Banner = { id: string; text: ReactNode; tone?: 'info' | 'warn' | 'bad'; actions?: BannerAction[] }

/** Each banner is a row under the header: the line, then its buttons (outlined; the screen's solid button is Edit). */
export function Banners({ banners }: { banners: Banner[] }) {
  if (!banners.length) return null
  return (
    <div className="flex shrink-0 flex-col border-t border-line">
      {banners.map((b) => (
        <div key={b.id} role="status" className="border-b border-line px-4 py-3">
          <p className={b.tone === 'bad' ? 'text-bad' : ''}>{b.text}</p>
          {!!b.actions?.length && (
            <div className="mt-2 flex flex-wrap gap-2">
              {b.actions.map((a) => <Button key={a.label} onClick={a.run} className="min-w-0 grow">{a.label}</Button>)}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
