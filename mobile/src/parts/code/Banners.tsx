// What the Code tab says above the editor about the open file: it changed on the cluster, an agent changed it,
// the cluster isn't connected, it can only be read, there are edits from earlier to restore, or a log ends in an
// error worth fixing. Each says what happened in one line and offers the next step.
import type { ReactNode } from 'react'

export type BannerAction = { label: string; run: () => void; primary?: boolean }
export type Banner = { id: string; text: ReactNode; tone?: 'info' | 'warn' | 'bad'; actions?: BannerAction[] }

const TONE = { info: 'bg-accent-soft text-text', warn: 'bg-warn-bg text-text', bad: 'bg-bad-bg text-text' }

export function Banners({ banners }: { banners: Banner[] }) {
  if (!banners.length) return null
  return (
    <div className="flex shrink-0 flex-col gap-2 px-3 pb-2">
      {banners.map((b) => (
        <div key={b.id} role="status" className={`rounded-xl px-3 py-2 ${TONE[b.tone ?? 'info']}`}>
          <p className="text-sm">{b.text}</p>
          {!!b.actions?.length && (
            <div className="mt-1 flex flex-wrap gap-2">
              {b.actions.map((a) => (
                <button key={a.label} onClick={a.run} className={`h-11 rounded-lg px-3 text-sm font-semibold
                  ${a.primary ? 'bg-accent text-white active:bg-accent-pressed' : 'bg-control active:bg-pressed'}`}>
                  {a.label}</button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
