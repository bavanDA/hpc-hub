// Settings, Appearance: light, dark, or follow the computer (theme.ts applies it, app.toml remembers it).
import { setAppearance, type Appearance } from '../../theme'
import { Row, Section, Segments } from '../e/ui'

const CHOICES = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']] as const

export function AppearanceGroup({ value, onChange }: { value: Appearance; onChange: (a: Appearance) => void }) {
  return (
    <Section title="Appearance">
      <Row label="Theme">
        <div className="w-[260px] shrink-0">
          <Segments label="Theme" value={value} options={CHOICES}
            onChange={(a) => { setAppearance(a); onChange(a) }} />
        </div>
      </Row>
    </Section>
  )
}
