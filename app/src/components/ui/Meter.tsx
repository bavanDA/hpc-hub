export function Meter({ value, label, className = '' }: { value: number; label?: string; className?: string }) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  const color = v >= 1 ? 'bg-bad-dot' : 'bg-text'
  return (
    <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={label}
      className={`h-1.5 overflow-hidden rounded-full bg-pill ${className}`}>
      <div className={`h-full rounded-full transition-[width] duration-220 ${color}`} style={{ width: `${v * 100}%` }} />
    </div>
  )
}
