import type { InputHTMLAttributes } from 'react'

export function Field({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} spellCheck={false}
    className={`h-9 min-w-0 rounded-lg border border-line-strong bg-window px-3 outline-none placeholder:text-faint
      focus:border-accent focus:ring-1 focus:ring-accent ${className}`} />
}
