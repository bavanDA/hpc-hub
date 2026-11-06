import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'

export function MainButton({ icon: Icon, className = '', children, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { icon?: LucideIcon }) {
  return (
    <button {...props} className={`flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4
      font-semibold text-on-accent hover:bg-accent-hover active:bg-accent-pressed disabled:opacity-40 ${className}`}>
      {Icon && <Icon size={18} className="shrink-0" />}{children}
    </button>
  )
}
