import { Check } from 'lucide-react'

import { setAppearance, THEMES, type Appearance } from '../../theme'

type Theme = (typeof THEMES)[number]

function Window({ colors: [win, side, line, text, button], className = '' }:
  { colors: Theme['sample']; className?: string }) {
  const bar = (w: string, o = 1) =>
    <span className="block h-[3px] rounded-full" style={{ width: w, background: text, opacity: o }} />
  return (
    <span className={`absolute inset-0 flex ${className}`} style={{ background: win }}>
      <span className="flex w-[30%] flex-col gap-[5px] px-[7px] pt-[9px]" style={{ background: side }}>
        {bar('80%', 0.7)}{bar('60%', 0.45)}{bar('70%', 0.45)}
      </span>
      <span className="flex flex-1 flex-col">
        {['85%', '65%'].map((w) => (
          <span key={w} className="flex flex-col gap-[4px] px-[8px] py-[7px]"
            style={{ borderBottom: `1px solid ${line}` }}>
            {bar(w, 0.85)}{bar('40%', 0.4)}
          </span>
        ))}
        <span className="mt-auto mr-[8px] mb-[8px] ml-auto block h-[9px] w-[30px] rounded-[3px]"
          style={{ background: button }} />
      </span>
    </span>
  )
}

const DARK = THEMES.find((t) => t.id === 'dark')!.sample

export function ThemePicker({ value, onChange }: { value: Appearance; onChange: (a: Appearance) => void }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-x-3 gap-y-4">
      {THEMES.map((t) => {
        const on = value === t.id
        return (
          <button key={t.id} type="button" aria-pressed={on} title={t.note}
            onClick={() => { setAppearance(t.id); onChange(t.id) }} className="group flex flex-col gap-2 text-left">
            <span className={`relative block aspect-[16/10] w-full overflow-hidden rounded-lg ${on
              ? 'outline-2 outline-offset-2 outline-accent' : 'outline-1 outline-line-strong group-hover:outline-dim'}`}>
              <Window colors={t.sample} />
              {t.id === 'system'
                && <Window colors={DARK} className="[clip-path:polygon(100%_0,100%_100%,0_100%)]" />}
            </span>
            <span className="flex items-center gap-1.5 text-sm font-medium">
              {t.label}{on && <Check size={14} aria-label="Chosen" className="shrink-0" />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
