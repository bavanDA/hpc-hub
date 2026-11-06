import type { TextareaHTMLAttributes } from 'react'

import { BOX } from './styles'

export function TextArea({ label, ...props }: { label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block py-1.5">
      <span className="mb-1.5 block text-sm text-dim">{label}</span>
      <textarea spellCheck={false} rows={4} {...props} className={`${BOX} block min-h-20 resize-y py-2.5`} />
    </label>
  )
}
