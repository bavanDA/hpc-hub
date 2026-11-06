/** Always neutral: the percent next to it says how full it is. mine: your part, drawn stronger inside the whole. */
export function Bar({ value, mine, className = 'w-40' }: { value: number; mine?: number | null; className?: string }) {
  const v = Math.max(0, Math.min(value, 1))
  const part = mine == null ? null : Math.max(0, Math.min(mine, v))
  return (
    <div className={`relative h-2 shrink-0 overflow-hidden rounded-full bg-pill ${className}`}>
      <div className={`absolute inset-y-0 left-0 rounded-full bg-text ${part != null ? 'opacity-40' : ''}`}
        style={{ width: `${v * 100}%` }} />
      {part != null && <div className="absolute inset-y-0 left-0 rounded-full bg-text" style={{ width: `${part * 100}%` }} />}
    </div>
  )
}
