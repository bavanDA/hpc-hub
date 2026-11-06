import { HardDrive, House } from 'lucide-react'

export function Crumbs({ path, home, go }: { path: string; home: string; go: (p: string) => void }) {
  const inHome = home && (path === home || path.startsWith(home + '/'))
  const base = inHome ? home : ''
  const parts = path.slice(base.length).split('/').filter(Boolean)
  const crumb = 'h-8 shrink-0 rounded-md px-2 hover:bg-hover'
  return (
    <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
      <button onClick={() => go(base || '/')} className={`${crumb} flex items-center gap-1.5 ${parts.length
        ? 'text-dim' : 'font-semibold'}`}>
        {inHome ? <><House size={14} /> Home</> : <><HardDrive size={14} /> /</>}
      </button>
      {parts.map((part, i) => (
        <span key={i} className="flex shrink-0 items-center">
          <span className="text-faint">/</span>
          <button onClick={() => go(`${base}/${parts.slice(0, i + 1).join('/')}`)}
            className={`${crumb} ${i === parts.length - 1 ? 'font-semibold' : 'text-dim'}`}>{part}</button>
        </span>
      ))}
    </div>
  )
}
