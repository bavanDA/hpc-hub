// A theme's little sample in Settings: its background with a line and its button color. System shows light and dark.
import type { THEMES } from '../../theme'

export function ThemeSample({ theme: t }: { theme: (typeof THEMES)[number] }) {
  const [bg, line, button] = t.sample
  const back = t.id === 'system' ? `linear-gradient(135deg, ${bg} 50%, ${line} 50%)` : bg
  return (
    <span aria-hidden className="relative block h-7 w-11 shrink-0 overflow-hidden rounded-md border border-line-strong"
      style={{ background: back }}>
      {t.id !== 'system' && <span className="absolute top-2 left-1.5 h-px w-5" style={{ background: line }} />}
      <span className="absolute right-1.5 bottom-1.5 h-2 w-4 rounded-sm" style={{ background: button }} />
    </span>
  )
}
