import type { ReactNode } from 'react'

/** A two or three way switch, like LaTeX | PDF. */
export function Segments<T extends string>({ value, options, onChange, small = false }:
  { value: T; options: [T, ReactNode][]; onChange: (v: T) => void; small?: boolean }) {
  return (
    <div role="radiogroup" className="flex shrink-0 gap-[2px] rounded-lg bg-pill p-[2px]">
      {options.map(([v, label]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={`rounded-md px-2.5 ${small ? 'h-6 text-xs' : 'h-7 text-sm'} ${value === v
            ? 'bg-window font-semibold text-text shadow-sm' : 'text-dim hover:text-text'}`}>{label}</button>
      ))}
    </div>
  )
}
