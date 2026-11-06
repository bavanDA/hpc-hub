/** How far a check or a copy is: black (white on dark) on grey, never red. */
export function Bar({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}
      className="h-1.5 overflow-hidden rounded-full bg-soft">
      <div className="h-full rounded-full bg-text transition-[width] duration-200" style={{ width: `${v * 100}%` }} />
    </div>
  )
}
