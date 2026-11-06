import { ScrollText } from 'lucide-react'

export function LogsButton({ open, errors, warnings, onClick }:
  { open: boolean; errors: number; warnings: number; onClick: () => void }) {
  return (
    <button onClick={onClick} title="Logs and issues"
      className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-sm ${open ? 'bg-selected' : 'hover:bg-hover'}`}>
      <ScrollText size={14} />
      {errors > 0 && <span className="rounded-full bg-bad px-1.5 text-xs font-semibold text-white">{errors}</span>}
      {warnings > 0 && <span className="rounded-full bg-warn px-1.5 text-xs font-semibold text-white
        dark:text-black">{warnings}</span>}
    </button>
  )
}
