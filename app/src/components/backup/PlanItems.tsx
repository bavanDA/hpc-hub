import type { PlanItem } from '../../types/backup'
import { IconToggleRow } from '../e/IconToggleRow'
import { CLASS } from './classes'
import { plan as copy } from './copy'
import { count, gb } from './format'

/** A plan's items grouped by folder: the folder once, a switch for each kind of file in it. */
export function PlanItems({ items, busy, onToggle }:
  { items: PlanItem[]; busy: boolean; onToggle: (i: PlanItem, keep: boolean) => void }) {
  const folders = [...new Set(items.map((i) => i.folder))]
  return folders.map((folder) => {
    const mine = items.filter((i) => i.folder === folder)
    return (
      <div key={folder}>
        <p className="px-5 pt-3 pb-1 font-mono text-sm break-all">{folder}</p>
        {mine.map((i, n) => {
          const why = n && mine[n - 1].why === i.why ? '' : i.why
          const by = copy.by[i.by]
          return <IconToggleRow key={i.kind} label={CLASS[i.kind]} checked={i.keep} disabled={busy}
            onChange={(k) => onToggle(i, k)}
            sub={[`${count(i.files)} ${i.files === 1 ? 'file' : 'files'}, ${gb(i.bytes)}`,
              why && (by ? `${by}: ${why}` : why)].filter(Boolean).join(' · ')} />
        })}
      </div>
    )
  })
}
