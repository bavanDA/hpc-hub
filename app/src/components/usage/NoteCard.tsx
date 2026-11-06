import type { Cluster, Session } from '../../types'
import { Skeleton } from '../ui/Skeleton'
import { Spinner } from '../ui/Spinner'
import { CARD } from './card'
import { CardHead } from './CardHead'

export function NoteCard({ c, s, title, text, busy }: { c: Cluster; s?: Session; title: string; text?: string; busy?: boolean }) {
  return (
    <div className={`${CARD} flex flex-col gap-3 px-[18px] pt-[18px] pb-4`}>
      <CardHead c={c} s={s} right={busy && <Spinner size={14} />} />
      <div className="text-md font-semibold">{title}</div>
      {busy ? <><Skeleton className="h-9 w-40" /><Skeleton className="h-2 w-full" /><Skeleton className="h-16 w-full" /></>
        : text && <p className="text-sm break-words text-dim">{text}</p>}
    </div>
  )
}
