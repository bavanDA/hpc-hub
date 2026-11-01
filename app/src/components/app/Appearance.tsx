// Settings, Appearance: light, dark, or follow the computer (theme.ts applies it, app.toml remembers it).
import { Monitor, Moon, Sun } from 'lucide-react'

import { setAppearance, type Appearance } from '../../theme'
import { Group } from '../clusters/fields'

const CHOICES: [Appearance, string, typeof Sun][] = [['system', 'System', Monitor], ['light', 'Light', Sun], ['dark', 'Dark', Moon]]

export function AppearanceGroup({ value, onChange }: { value: Appearance; onChange: (a: Appearance) => void }) {
  return (
    <Group title="Appearance">
      <div className="flex min-h-[56px] items-center gap-3 px-4 py-2">
        <div className="min-w-0 flex-1">Theme</div>
        <div role="radiogroup" aria-label="Theme" className="flex rounded-md bg-control p-0.5">
          {CHOICES.map(([id, label, Icon]) => {
            const on = value === id
            return (
              <button key={id} type="button" role="radio" aria-checked={on}
                onClick={() => { setAppearance(id); onChange(id) }}
                className={`flex h-[30px] items-center gap-1.5 rounded-[5px] px-3 text-sm transition-colors duration-[90ms]
                  ${on ? 'bg-raised font-semibold shadow-[var(--shadow-card)]' : 'text-dim hover:text-text'}`}>
                <Icon size={14} aria-hidden />{label}
              </button>
            )
          })}
        </div>
      </div>
    </Group>
  )
}
