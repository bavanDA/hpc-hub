export function Chips<T extends string>({ options, value, onChange, label }:
  { options: readonly (readonly [T, string])[]; value: T[]; onChange: (v: T[]) => void; label?: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map(([v, text]) => {
        const on = value.includes(v)
        return (
          <button key={v} aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== v) : [...value, v])}
            className={`flex h-8 items-center rounded-full border px-3 text-sm font-medium ${on
              ? 'border-accent bg-accent text-on-accent' : 'border-line-strong text-dim hover:bg-hover'}`}>{text}</button>
        )
      })}
    </div>
  )
}
