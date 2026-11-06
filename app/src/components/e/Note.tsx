import { CircleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

export function Note({ bad = false, children, action }: { bad?: boolean; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`flex items-start gap-2 px-5 pt-3 ${bad ? 'text-bad' : 'text-dim'}`}>
      <CircleAlert size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">{children}{action && <div className="mt-2">{action}</div>}</div>
    </div>
  )
}
