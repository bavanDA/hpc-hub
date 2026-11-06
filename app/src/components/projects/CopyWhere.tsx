import { FolderOpen } from 'lucide-react'

import type { CopyTarget, CopyTargets, Place } from '../../types/projects'
import { shortName } from '../clusters/loginCopy'
import { ChoiceRow } from '../e/ChoiceRow'
import { Field } from '../e/Field'
import { List } from '../e/List'
import { Segments } from '../e/Segments'
import { Spinner } from '../ui'
import { inside } from './copyInto'

type Props = {
  info: CopyTargets
  to: string
  onTo: (id: string) => void
  dst: CopyTarget | undefined
  spots: Place[]
  spot: Place | undefined
  into: string | null
  intoPath: string
  onInto: (path: string) => void
  onBrowse: () => void
}

/** The cluster, the storage place and the folder the copy lands in. */
export function CopyWhere({ info, to, onTo, dst, spots, spot, into, intoPath, onInto, onBrowse }: Props) {
  const dstName = dst ? shortName(dst) : ''
  return (
    <>
      <List>
        <ChoiceRow label="To" value={to} onChange={onTo} options={info.targets.map((t) => ({ value: t.id,
          label: t.same ? `${shortName(t)}, another folder` : shortName(t),
          hint: t.same ? 'Like another group\'s Project' : t.connected ? 'Connected' : 'Not connected' }))} />
      </List>
      <div className="px-5 pt-3">
        {dst && !dst.connected
          ? <p className="text-sm text-dim">Connect to {dstName} on Clusters to choose Home, Project or Scratch.</p>
          : spots.length > 0 ? <Segments label="Into" value={spot?.label ?? ''}
              options={spots.map((s) => [s.label, s.label] as const)}
              onChange={(label) => {
                const s = spots.find((x) => x.label === label)
                if (s && !inside(intoPath, s.path)) onInto(s.path)
              }} />
            : <Spinner />}
        {spot?.label.startsWith('Scratch') && (
          <p className="pt-2 text-sm text-dim">Scratch gets cleaned up. Keep work you need in Project.</p>
        )}
        <div className="flex items-end gap-2 pt-1">
          <div className="min-w-0 flex-1"><Field label="Into folder" value={into ?? intoPath}
            onChange={(e) => onInto(e.target.value)} /></div>
          <button aria-label="Choose a folder" title="Choose a folder" onClick={onBrowse}
            className="mb-1.5 grid size-10 shrink-0 place-items-center rounded-lg border border-line-strong
              hover:bg-hover active:bg-pressed"><FolderOpen size={18} className="text-dim" /></button>
        </div>
        <p className="text-sm text-dim">Lands in <span className="font-mono break-all">
          {intoPath.replace(/\/+$/, '')}/{info.name}</span></p>
      </div>
    </>
  )
}
