export function NumberBox({ label, value, unit, bad, onChange, autoFocus, inline = false }: {
  label: string; value: string; unit: string; bad: boolean; onChange: (text: string) => void; autoFocus?: boolean
  inline?: boolean
}) {
  return (
    <label className={`flex h-11 min-w-0 shrink-0 items-center ${inline ? 'grow basis-0' : ''} rounded-lg
      border-[1.5px] bg-window px-3 ${bad ? 'border-bad' : 'border-accent'}`}>
      <input aria-label={label} aria-invalid={bad} type="text" inputMode="numeric" autoFocus={autoFocus}
        value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
        className="w-full min-w-0 bg-transparent text-[18px] font-semibold tabular-nums outline-none" />
      <span className="ml-2 shrink-0 text-dim">{unit}</span>
    </label>
  )
}
