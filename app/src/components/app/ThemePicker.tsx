import { Check } from 'lucide-react'

import { setAppearance, THEMES, type Appearance } from '../../theme'
import { ThemeWindow } from './ThemeWindow'

export type Theme = (typeof THEMES)[number]

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
              <ThemeWindow colors={t.sample} />
              {t.id === 'system'
                && <ThemeWindow colors={DARK} className="[clip-path:polygon(100%_0,100%_100%,0_100%)]" />}
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
