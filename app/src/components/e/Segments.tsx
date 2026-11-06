/** value '' when none is current. fit: each as wide as its words instead of sharing the width. */
export function Segments<T extends string>({ value, options, onChange, label, fit = false }: {
  value: T | ''; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label?: string; fit?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex min-h-10 gap-[3px] rounded-lg border
      border-line-strong p-[3px]">
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={v === value} onClick={() => onChange(v)}
          className={`rounded-md py-1 text-sm leading-tight ${fit ? 'px-3.5 whitespace-nowrap'
            : 'min-w-0 flex-1 px-2 break-words'} ${v === value
            ? 'bg-accent font-semibold text-on-accent' : 'font-medium text-dim hover:bg-hover active:bg-pressed'}`}>
          {text}</button>
      ))}
    </div>
  )
}
