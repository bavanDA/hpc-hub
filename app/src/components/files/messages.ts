import type { Transfer } from '../../types/files'
import type { How } from './PasteDialog'

export const finishedMessage = (t: Transfer) =>
  t.error ? (t.error === 'Cancelled' ? 'Copy cancelled' : `Copy failed: ${t.error}`) : `Copied ${t.title.split(':')[0]}`

export const startedMessage = (sameCluster: boolean, how: How, name: string) =>
  sameCluster ? `Copying ${name}…` : how === 'globus' ? 'Sent to Globus. Progress is below' : 'Copying. Progress is below'
