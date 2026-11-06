import type { LucideIcon } from 'lucide-react'

export function IconTile({ icon: Icon, size = 40, tone = 'neutral' }:
  { icon: LucideIcon; size?: 40 | 56; tone?: 'neutral' | 'accent' | 'success' }) {
  const look = tone !== 'neutral' ? 'text-text' : 'text-dim'
  return (
    <div className={`grid shrink-0 place-items-center rounded-lg border border-line ${size === 56 ? 'size-14' : 'size-10'}
      ${look}`}>
      <Icon size={size === 56 ? 24 : 20} />
    </div>
  )
}
