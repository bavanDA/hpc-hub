import { Search, X } from 'lucide-react'

export function SearchField({ value, onChange, placeholder = 'Search', autoFocus }:
  { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  return (
    <label className="flex h-10 items-center gap-2 rounded-lg bg-soft px-3">
      <Search size={16} className="shrink-0 text-dim" />
      <input value={value} placeholder={placeholder} aria-label={placeholder} autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)} spellCheck={false}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-dim" />
      {value && <button aria-label="Clear" onClick={() => onChange('')}
        className="-mr-1.5 grid size-7 place-items-center rounded-md text-dim hover:bg-hover"><X size={15} /></button>}
    </label>
  )
}
