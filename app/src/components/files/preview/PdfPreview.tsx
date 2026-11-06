import { ImageOff } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Pdf } from '../../pdf'
import { readFile } from '../../pdf/load'
import { Note } from './Note'

export function PdfPreview({ cluster, path, stamp }: { cluster: string; path: string; stamp: string }) {
  const [got, setGot] = useState<{ stamp: string; data?: Uint8Array; error?: string } | null>(null)
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    let live = true  // you may pick another file before this one arrives
    setProgress(0)
    readFile(cluster, path, (p) => live && setProgress(p))
      .then((data) => live && setGot({ stamp, data }))
      .catch((e: Error) => live && setGot({ stamp, error: e.message }))
    return () => { live = false }
  }, [cluster, path, stamp])
  const now = got?.stamp === stamp ? got : null
  return <Pdf compact data={now?.data ?? null} memory={`preview:${stamp}`} loading={!now} progress={progress}
    message={now?.error ? <Note icon={ImageOff} title="No preview" text={now.error} /> : undefined} />
}
