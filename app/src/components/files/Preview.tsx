import { FileQuestion, FileType, ImageOff, Pencil, ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { Entry, FileData } from '../../types/files'
import { Pdf } from '../pdf'
import { readFile } from '../pdf/load'
import { Button } from '../ui/Button'
import { Spinner } from '../ui/Spinner'
import { FileIcon } from './FileIcon'
import { isText, join, kind, MEDIA_LIMIT, size, when } from './format'

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

function Content({ data }: { data: FileData }) {
  if (data.kind === 'image') {
    return (
      <div className="grid h-full place-items-center p-4"
        style={{ backgroundImage: 'repeating-conic-gradient(var(--color-pill) 0 25%, transparent 0 50%)',
          backgroundSize: '16px 16px' }}>
        <img src={`data:${data.mime};base64,${data.data}`} alt="" className="max-h-full max-w-full object-contain" />
      </div>
    )
  }
  if (data.kind === 'binary') return <Note icon={FileQuestion} title="Binary file" text="Nothing to show as text." />
  return (
    <pre className="h-full overflow-auto whitespace-pre-wrap bg-view p-3 font-mono text-xs leading-[18px]
      select-text [overflow-wrap:anywhere]">
      {data.text}{data.cut && <span className="text-dim">{'\n'}… first 512 kB only</span>}
    </pre>
  )
}

function PdfPreview({ cluster, path, stamp }: { cluster: string; path: string; stamp: string }) {
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

function Placeholder({ entry, onOpen }: { entry: Entry; onOpen: () => void }) {
  const k = kind(entry)
  if (k === 'pdf') {
    return <Note icon={FileType} title="Big PDF" text="Too big to preview here. Open it to read it."
      action={<Button kind="primary" onClick={onOpen}>Open</Button>} />
  }
  if (k === 'image') return <Note icon={ImageOff} title="Too big to preview" text="Open it to see it." />
  return <Note icon={FileQuestion} title="No preview" text="No preview for this type of file." />
}

function Note({ icon: Icon, title, text, action }:
  { icon: typeof FileType; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <Icon size={40} strokeWidth={1.25} className="text-dim" />
      <div className="font-semibold">{title}</div>
      <p className="text-sm text-dim">{text}</p>
      {action}
    </div>
  )
}
