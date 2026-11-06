import { Minus, Plus } from 'lucide-react'
import { useState } from 'react'

import type { Changes, Note } from '../../../../types/history'
import type { Where } from '../git'
import type { CardSpot } from '../notes/SpotCard'
import { Segments } from '../ui/Segments'
import { Built } from './Built'
import { Marks } from './Marks'
import { Side } from './Side'

type PdfMode = 'marks' | 'side' | 'redblue'
type Props = {
  where: Where
  main: string
  root: string
  clusterName: string
  current: Uint8Array | null  // the PDF you have now
  from: string  // versions: "" is the files now
  to: string
  changes: Changes | null
  guard: (run: () => void) => void  // asks for a compute node first, like Recompile
  onSource: (path: string, line: number) => void
  notes: Note[]  // their pins on the PDF
  onPin: (id: string) => void
  onSpot: (s: CardSpot) => void  // ask about a spot, or note it
}

export function PdfView({ where, main, root, clusterName, current, from, to, changes, guard, onSource, notes, onPin,
  onSpot }: Props) {
  const [mode, setMode] = useState<PdfMode>('marks')
  const [zoom, setZoom] = useState(1)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-4">
        <Segments value={mode} onChange={setMode} options={[['marks', 'Marks'], ['side', 'Side by side'],
          ['redblue', 'Red and blue']]} />
        <span className="flex-1" />
        <button onClick={() => setZoom(Math.max(0.5, zoom - 0.25))} aria-label="Zoom out"
          className="grid size-8 place-items-center rounded-md text-dim hover:bg-hover"><Minus size={15} /></button>
        <span className="w-12 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(Math.min(3, zoom + 0.25))} aria-label="Zoom in"
          className="grid size-8 place-items-center rounded-md text-dim hover:bg-hover"><Plus size={15} /></button>
      </div>
      {mode === 'marks' ? <Marks where={where} main={main} root={root} current={current} changes={changes} zoom={zoom}
          onSource={onSource} notes={notes} onPin={onPin} onSpot={onSpot} />
        : mode === 'side' ? <Side where={where} main={main} clusterName={clusterName} current={current} from={from}
          to={to} zoom={zoom} guard={guard} />
        : <Built key={`${from}-${to}`} where={where} main={main} clusterName={clusterName} version={to} against={from}
          guard={guard} zoom={zoom} what="The red and blue version" />}
    </div>
  )
}
