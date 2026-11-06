import type { LockStatus } from '../../types/permissions'
import { EDialog, List, Row } from '../e/ui'

export function ActivityDialog({ status, onClose }: { status: LockStatus; onClose: () => void }) {
  return (
    <EDialog title="Recent activity" width={640} onClose={onClose}>
      {status.log.length
        ? <List>{status.log.map((l, i) => <Row key={i} label={<span className="font-mono text-sm select-text">{l}</span>} />)}
          </List>
        : <p className="px-5 pb-3 text-dim">Nothing yet.</p>}
    </EDialog>
  )
}
