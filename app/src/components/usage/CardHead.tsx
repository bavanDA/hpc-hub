import type { Cluster, Session } from '../../types'
import { SessionDot } from '../clusters/SessionDot'
import { fullName } from './summary'

export function CardHead({ c, s, right }: { c: Cluster; s?: Session; right?: React.ReactNode }) {
  return (
    <div className="flex h-[22px] items-center gap-2">
      <SessionDot session={s} /><span className="truncate text-sm text-dim">{fullName(c)}</span>
      <span className="flex-1" />{right}
    </div>
  )
}
