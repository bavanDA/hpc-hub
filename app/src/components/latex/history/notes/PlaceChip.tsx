import { MapPin } from 'lucide-react'

import type { NotePlace } from '../../../../types/history'
import { fileName, shortHash } from '../format'
import { isLine, isPage } from './places'

export function PlaceChip({ place, onGo }: { place: NotePlace | null; onGo: () => void }) {
  if (!place) return <span className="rounded bg-pill px-1.5 text-xs text-dim">To-do</span>
  const label = isLine(place) ? <><span className="font-semibold">{fileName(place.path)}</span> {place.line}</>
    : isPage(place) ? <>p. {place.page}</> : <>{shortHash((place as { hash: string }).hash)}</>
  return (
    <button onClick={onGo} title="Go there"
      className="flex h-5 items-center gap-1 rounded bg-pill px-1.5 font-mono text-xs hover:bg-pressed">
      <MapPin size={11} className="text-dim" /> {label}</button>
  )
}
