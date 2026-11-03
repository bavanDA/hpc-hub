// Settings, Appearance: System, Light, Dark, or a named theme from a code editor's colors (theme.ts applies it,
// app.toml remembers it). Each is a row with a little sample.
import { setAppearance, THEMES, type Appearance } from '../../theme'
import { Row, Section, Tick } from '../e/ui'
import { ThemeSample } from './ThemeSample'

export function AppearanceGroup({ value, onChange }: { value: Appearance; onChange: (a: Appearance) => void }) {
  return (
    <Section title="Appearance">
      {THEMES.map((t) => (
        <Row key={t.id} label={<span className="flex items-center gap-3"><ThemeSample theme={t} />{t.label}</span>}
          sub={<span className="block pl-14">{t.note}</span>}
          onPress={() => { setAppearance(t.id); onChange(t.id) }}><Tick on={value === t.id} /></Row>
      ))}
    </Section>
  )
}
