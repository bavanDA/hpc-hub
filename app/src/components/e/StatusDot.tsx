export type Tone = 'on' | 'connected' | 'busy' | 'off' | 'error'

/** Solid when on (green when connected), breathing while busy, hollow when off, red on an error. */
export function StatusDot({ tone }: { tone: Tone }) {
  const look = { on: 'bg-text', connected: 'bg-ok-dot', busy: 'bg-dim animate-pulse', off: 'border-[1.5px] border-dim',
    error: 'bg-bad' }[tone]
  return <span aria-hidden className={`inline-block size-2 shrink-0 rounded-full ${look}`} />
}
