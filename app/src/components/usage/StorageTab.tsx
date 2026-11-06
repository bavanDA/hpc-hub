import type { Storage } from '../../types/usage'
import { List } from '../ui/List'
import { QuotaRow } from './QuotaRow'
import { Section } from './Section'

export function StorageTab({ storage, error, onBackup }:
  { storage: Storage | null; error: string; onBackup?: () => void }) {
  const note = error ? `Could not load: ${error}` : !storage ? 'Loading…' : ''
  return (
    <Section note={note}>
      {storage && storage.rows.length > 0 && <List>{storage.rows.map((r) => <QuotaRow key={r.label} r={r}
        onBackup={/scratch/i.test(r.label) ? onBackup : undefined} />)}</List>}
      {storage?.raw && <pre className="overflow-auto rounded-lg bg-soft p-4 font-mono text-sm select-text">
        {storage.raw}</pre>}
    </Section>
  )
}
