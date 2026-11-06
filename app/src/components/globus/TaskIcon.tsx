import { CircleCheck, CircleX, Loader2, Pause } from 'lucide-react'

import type { Task } from '../../types/globus'

export function TaskIcon({ t }: { t: Task }) {
  if (t.status === 'SUCCEEDED') return <CircleCheck size={20} className="shrink-0 text-dim" />
  if (t.status === 'FAILED') {
    return <CircleX size={20} className={`shrink-0 ${t.cancelled ? 'text-dim' : 'text-bad'}`} />
  }
  if (t.status === 'INACTIVE') return <Pause size={20} className="shrink-0 text-dim" />
  return <Loader2 size={20} className="shrink-0 animate-spin text-dim" />
}
