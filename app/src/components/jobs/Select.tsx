import { ChevronDown } from 'lucide-react'

export function Select<T extends string>({ value, options, onChange, label, disabled }: {
  value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label: string; disabled?: boolean
}) {
  return (
    <div className="relative shrink-0">
      <select aria-label={label} title={label} value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-9 appearance-none rounded-lg border border-line-strong bg-window pr-8 pl-3 font-medium
          outline-none hover:bg-hover focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent
          disabled:opacity-50">
        {options.map(([v, text]) => <option key={v} value={v} className="bg-window text-text">{text}</option>)}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-dim" />
    </div>
  )
}
