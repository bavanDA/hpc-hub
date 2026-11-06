import type { LucideIcon } from 'lucide-react'

/** size is the icon's; small makes the button 28px instead of 36px. */
export function IconButton({ icon: Icon, label, onClick, size = 16, small = false, disabled, className = '' }:
  { icon: LucideIcon; label: string; onClick?: () => void; size?: number; small?: boolean; disabled?: boolean
    className?: string }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className={`grid shrink-0 place-items-center rounded-md text-dim transition-colors duration-90 hover:bg-hover
        hover:text-text active:bg-pressed disabled:opacity-45 ${small ? 'size-7' : 'size-9'} ${className}`}>
      <Icon size={size} />
    </button>
  )
}
