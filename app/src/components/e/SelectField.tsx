import { ChevronDown } from 'lucide-react'

import { BOX } from './styles'

/** A dropdown with its label above, for a choice like a model or an effort. */
export function SelectField<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void
}) {
  return (
    <label className="block py-1.5">
      <span className="mb-1.5 block text-sm text-dim">{label}</span>
      <span className="relative block">
        <select value={value} onChange={(e) => onChange(e.target.value as T)} className={`h-10 appearance-none pr-9 ${BOX}`}>
          {options.map(([v, text]) => <option key={v} value={v} className="bg-window text-text">{text}</option>)}
        </select>
        <ChevronDown size={16} className="pointer-events-none absolute top-3 right-3 text-dim" />
      </span>
    </label>
  )
}
