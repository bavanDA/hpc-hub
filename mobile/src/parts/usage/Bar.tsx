// A level bar in style E: grey track, the fill in the text color. No colors: the number next to it says when it's full.
// mine: the part that is yours, solid inside a paler whole.
export function Bar({ value, mine, label, className = '' }:
  { value: number; mine?: number | null; label?: string; className?: string }) {
  const v = Math.max(0, Math.min(Number.isFinite(value) ? value : 0, 1))
  const part = mine == null ? null : Math.max(0, Math.min(mine, v))
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}
      className={`relative h-1.5 overflow-hidden rounded-full bg-soft ${className}`}>
      <div className={`absolute inset-y-0 left-0 rounded-full bg-text ${part != null ? 'opacity-30' : ''}`}
        style={{ width: `${v * 100}%` }} />
      {part != null && <div className="absolute inset-y-0 left-0 rounded-full bg-text"
        style={{ width: `${part * 100}%` }} />}
    </div>
  )
}
