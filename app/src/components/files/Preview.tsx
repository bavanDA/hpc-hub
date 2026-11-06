import { ImageOff, Pencil, ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { Entry, FileData } from '../../types/files'
import { Button } from '../ui/Button'
import { Spinner } from '../ui/Spinner'
import { FileIcon } from './FileIcon'
import { isText, join, kind, MEDIA_LIMIT, size, when } from './format'
import { Content } from './preview/Content'
import { Note } from './preview/Note'
import { PdfPreview } from './preview/PdfPreview'
import { Placeholder } from './preview/Placeholder'

type Shown = { key: string; data?: FileData; error?: string }
const PDF_PREVIEW_LIMIT = 40 * 1024 * 1024

export function Preview({ cluster, dir, entry, onOpen, onEdit }:
  { cluster: string; dir: string; entry: Entry; onOpen: () => void; onEdit: () => void }) {
  const path = join(dir, entry.name)
  const k = kind(entry)
  const wanted = k === 'image' ? entry.size <= MEDIA_LIMIT : isText(entry)
  const key = `${cluster}:${path}:${entry.mtime}`
  const [shown, setShown] = useState<Shown | null>(null)

  useEffect(() => {
    if (!wanted) return
    let live = true  // you may pick another file before this one arrives
    call<FileData>('files.read', { cluster, path })
      .then((data) => live && setShown({ key, data }))
      .catch((e: Error) => live && setShown({ key, error: e.message }))
    return () => { live = false }
  }, [cluster, path, key, wanted])

  const now = shown?.key === key ? shown : null
  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-line bg-window">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <FileIcon entry={entry} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold" title={entry.name}>{entry.name}</div>
          <div className="truncate text-sm text-dim">{size(entry.size)} · {when(entry.mtime)}</div>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {k === 'pdf' && entry.size <= PDF_PREVIEW_LIMIT ? <PdfPreview cluster={cluster} path={path} stamp={key} />
          : !wanted ? <Placeholder entry={entry} onOpen={onOpen} />
          : !now ? <div className="grid h-full place-items-center"><Spinner size={24} /></div>
          : now.error ? <Note icon={ImageOff} title="No preview" text={now.error} />
          : <Content data={now.data!} />}
      </div>
      <div className="flex gap-2 border-t border-line p-3">
        <Button className="flex-1" onClick={onOpen}><ExternalLink size={16} className="text-dim" /> Open</Button>
        {isText(entry) && <Button className="flex-1" onClick={onEdit}><Pencil size={16} className="text-dim" /> Edit
        </Button>}
      </div>
    </aside>
  )
}
