export function Choice<T extends string>({ label, value, options, onPick }:
  { label: string; value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-line">
      <span>{label}</span>
      <div role="radiogroup" aria-label={label} className="flex gap-0.5 rounded-[7px] bg-control p-0.5">
        {options.map(([v, l]) => (
          <button key={v} role="radio" aria-checked={value === v} onClick={() => onPick(v)}
            className={`h-[26px] min-w-[30px] rounded-[5px] px-2.5 text-sm ${value === v
              ? 'bg-window font-semibold text-text shadow-[0_0_0_1px_var(--color-line-strong)]' : 'text-dim hover:text-text'}`}>
            {l}</button>
        ))}
      </div>
    </div>
  )
}
