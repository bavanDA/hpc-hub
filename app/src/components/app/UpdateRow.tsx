// Settings' Check for updates row: asks GitHub now, says what it found, and opens the update window when there is one.
import { Row } from '../e/Row'
import { checkUpdates, openUpdateDialog, useUpdateState } from './updates'

export function UpdateRow({ onOpen }: { onOpen: () => void }) {
  const s = useUpdateState()
  const ready = 'version' in s && s.version && s.kind !== 'error' ? s.version : ''
  const sub = s.kind === 'checking' ? 'Checking…'
    : ready ? `Version ${ready} is ready to install`
    : s.kind === 'none' ? 'You have the newest version'
    : s.kind === 'error' ? s.text
    : undefined
  return (
    <Row label={ready ? 'Update HPC Hub' : 'Check for updates'} sub={sub} opens={!!ready}
      onPress={() => {
        if (ready) { onOpen(); openUpdateDialog() } else if (s.kind !== 'checking') void checkUpdates()
      }} />
  )
}
