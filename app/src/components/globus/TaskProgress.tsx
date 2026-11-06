import type { Task } from '../../types/globus'

export function TaskProgress({ t }: { t: Task }) {
  const part = t.files ? Math.min(1, t.files_done / t.files) : 0
  return (
    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-pill">
      {t.files ? <div className="h-full rounded-full bg-text transition-[width] duration-220" style={{ width: `${part * 100}%` }} />
        : <div className="h-full w-1/3 animate-pulse rounded-full bg-dim" />}
    </div>
  )
}
