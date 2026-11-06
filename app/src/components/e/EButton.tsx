import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'

type Kind = 'primary' | 'plain' | 'danger' | 'quiet'

const LOOK: Record<Kind, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-pressed',
  plain: 'border border-line-strong hover:bg-hover active:bg-pressed',
  danger: 'bg-bad-fill text-white hover:brightness-95 active:brightness-90',  // destructive: always solid red
  quiet: 'hover:bg-hover active:bg-pressed',
}

export function EButton({ kind = 'plain', small = false, icon: Icon, className = '', children, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { kind?: Kind; small?: boolean; icon?: LucideIcon }) {
  return (
    <button type="button" {...props} className={`flex shrink-0 items-center justify-center gap-2 rounded-lg
      text-center leading-tight font-semibold whitespace-nowrap disabled:opacity-40 ${small ? 'h-8 px-3 text-sm'
      : 'h-10 px-4'} ${LOOK[kind]} ${className}`}>
      {Icon && <Icon size={small ? 14 : 16} className="shrink-0" />}{children}
    </button>
  )
}
