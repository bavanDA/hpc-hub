import { Select } from './Select'

/** One of a few side by side; a dropdown when there are too many to fit (Cursor's models). */
export function Choices({ label, value, options, onChange }:
  { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  if (options.length > 6) return <Select label={label} value={value} options={options} onChange={onChange} />
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-[3px] rounded-lg border border-line-strong p-[3px]">
      {options.map(([v, text]) => {
        const on = v === value
        return (
          <button key={v} type="button" role="radio" aria-checked={on} onClick={() => onChange(v)}
            className={`h-7 flex-auto rounded-md px-2 text-[13px] whitespace-nowrap ${on
              ? 'bg-accent font-semibold text-on-accent' : 'font-medium text-dim hover:bg-hover active:bg-pressed'}`}>
            {text}</button>
        )
      })}
    </div>
  )
}
