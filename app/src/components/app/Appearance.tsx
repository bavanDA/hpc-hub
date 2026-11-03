// Settings, Appearance: System, Light, Dark, or a named theme from a code editor's colors, picked from little
// previews (theme.ts applies it, app.toml remembers it).
import type { Appearance } from '../../theme'
import { ThemePicker } from './ThemePicker'

export function AppearanceGroup({ value, onChange }: { value: Appearance; onChange: (a: Appearance) => void }) {
  return (
    <section className="pb-6">
      <h3 className="px-5 pb-3 text-xs font-semibold tracking-wide text-dim uppercase">Appearance</h3>
      <div className="px-5"><ThemePicker value={value} onChange={onChange} /></div>
    </section>
  )
}
