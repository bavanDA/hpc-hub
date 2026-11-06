import { ChevronDown } from 'lucide-react'

const SELECT = 'h-8 max-w-[220px] cursor-pointer appearance-none rounded-md bg-pill pr-7 pl-2.5 text-sm font-semibold '
  + 'outline-none hover:bg-pressed focus:ring-2 focus:ring-focus'

export function Select({ label, value, options, onChange }:
  { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <span className="relative">
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={SELECT}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute top-2 right-2 text-dim" />
    </span>
  )
}
