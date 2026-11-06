import { ChevronRight } from 'lucide-react'

import type { Cluster, Session } from '../../types'
import type { Storage } from '../../types/usage'
import { StatusDot } from '../clusters/ClusterPicker'
import { Skeleton } from '../ui/Skeleton'
import { Bar } from './Bar'
import { CARD } from './card'
import { fullName, storageSize } from './summary'
import type { Answer } from './useEach'
import type { OpenView } from './view'

export function StorageCard({ c, s, got, onOpen }: { c: Cluster; s?: Session; got: Answer<Storage>; onOpen: OpenView }) {
  const rows = got.data?.rows ?? []
  return (
    <div className={`${CARD} px-[18px] pt-3 pb-2`}>
      <button onClick={() => onOpen(c.id, 'storage')} title={`Open storage on ${fullName(c)}`}
        className="-mx-2 flex items-center gap-2 rounded-md px-2 py-0.5 font-semibold hover:bg-hover">
        <StatusDot session={s} />{fullName(c)}<ChevronRight size={14} className="text-dim" />
      </button>
      {got.loading && !got.data && <div className="flex flex-col gap-3 py-3"><Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" /></div>}
      {got.error && <p className="py-2 text-sm text-dim">Could not read storage: {got.error}</p>}
      {got.data?.raw && !rows.length && <p className="py-2 text-sm text-dim">
        The quota tool's answer is shown as plain text. Open storage to read it.</p>}
      {got.data && !rows.length && !got.data.raw && <p className="py-2 text-sm text-dim">No quotas found.</p>}
      {rows.map((r) => (
        <div key={r.label} className="py-[9px]">
          <div className="mb-1.5 flex gap-2 text-sm"><span className="min-w-0 flex-1 truncate">{r.label}</span>
            <span className="whitespace-nowrap tabular-nums">{storageSize(r)}</span></div>
          {r.quota > 0 && <Bar value={r.used / r.quota} mine={r.mine != null ? r.mine / r.quota : null}
            className="w-full" />}
          {(r.purged ?? 0) > 0 && <div className="mt-1 text-xs text-dim">
            Files older than {r.purged} days are deleted</div>}
        </div>
      ))}
    </div>
  )
}
