import { useEffect, useState, useSyncExternalStore } from 'react'

import { Reader, type Snapshot, type Source } from './reader'
import { voices, type Voice } from './voices'

/** One reader for as long as the component lives, following the PDF it reads. */
export function useReader(source: Source | null | undefined): Reader {
  const [r] = useState(() => new Reader())
  useEffect(() => { r.setSource(source ?? null) }, [r, source?.cluster, source?.path])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => r.close(), [r])
  return r
}

export function useReaderState(r: Reader): Snapshot {
  return useSyncExternalStore(r.subscribe, r.getSnapshot)
}

export function useVoices(): Voice[] {
  const [list, setList] = useState<Voice[]>([])
  useEffect(() => { voices().then((v) => setList(v.voices)).catch(() => {}) }, [])
  return list
}
