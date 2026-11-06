import type { Session } from '../../types'
import { statusKind } from '../ui/status'
import { DOT } from './dot'

export function SessionDot({ session }: { session?: Session }) {
  const kind = session?.connected ? 'success' : statusKind(session?.state ?? 'Disconnected')
  return <span aria-hidden className={`inline-block size-2 shrink-0 rounded-full ${DOT[kind]}`} />
}
