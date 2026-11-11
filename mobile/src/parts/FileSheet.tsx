// A file from the cluster, to look at, in a window (the desktop's preview pane): text, images and PDFs (pdf.js,
// fetched a few MB at a time). Edit opens it in the Code page; Download and Share copy it to this phone first.
import { Download, FileQuestion, Pencil, Share2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { kind, MEDIA_LIMIT } from '@shared/components/files/format'
import { readFile } from '@shared/components/pdf/load'
import { Spinner } from '@shared/components/ui/Spinner'
import { call } from '@shared/rpc'
import type { FileData } from '@shared/types/files'
import { Button, Dialog, EmptyState, useToast } from '../ui'
import { ReadAloudPdf } from './ReadAloudPdf'

const TEXT_LIMIT = 2 * 1024 * 1024

export type FileActions = { onEdit?: () => void; onDownload?: () => void; onShare?: () => void }

export function FileSheet({ cluster, path, size = 0, onClose, onEdit, onDownload, onShare }:
  { cluster: string; path: string; size?: number; onClose: () => void } & FileActions) {
  const name = path.split('/').pop() ?? path
  const pdf = kind({ name, kind: 'f', size, mtime: 0 }) === 'pdf'
  const actions = onEdit || onDownload || onShare
  return (
    <Dialog title={name} onClose={onClose} width={640} actions={actions && <>
      {onShare && <Button icon={Share2} aria-label="Share" onClick={onShare} />}
      {onDownload && <Button icon={Download} className="flex-1" onClick={onDownload}>Download</Button>}
      {onEdit && <Button kind="primary" icon={Pencil} className="flex-1" onClick={onEdit}>Edit</Button>}
    </>}>
      {pdf ? <PdfPreview cluster={cluster} path={path} size={size} onDownload={onDownload} />
        : <div className="px-5"><Preview cluster={cluster} path={path} onClose={onClose} /></div>}
    </Dialog>
  )
}

function Preview({ cluster, path, onClose }: { cluster: string; path: string; onClose: () => void }) {
  const toast = useToast()
  const [file, setFile] = useState<FileData | null>(null)
  useEffect(() => {
    call<FileData>('files.read', { cluster, path, limit: TEXT_LIMIT }).then(setFile)
      .catch((e: Error) => { toast(e.message); onClose() })
  }, [cluster, path, toast, onClose])

  if (!file) return <div className="grid h-40 place-items-center"><Spinner size={28} /></div>
  if (file.kind === 'image') {
    return <img src={`data:${file.mime};base64,${file.data}`} alt="" className="mx-auto max-w-full" />
  }
  if (file.kind === 'text') {
    return (
      <pre className="select-text whitespace-pre-wrap font-mono text-[13px] leading-snug [overflow-wrap:anywhere]">
        {file.text}{file.cut && <span className="text-dim">{'\n\n'}Only the first 2 MB show here.</span>}</pre>
    )
  }
  return <EmptyState icon={FileQuestion} title="No preview" text="This kind of file can't be shown here." />
}

function PdfPreview({ cluster, path, size, onDownload }:
  { cluster: string; path: string; size: number; onDownload?: () => void }) {
  const [data, setData] = useState<Uint8Array | null>(null)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(0)
  const big = size > MEDIA_LIMIT
  useEffect(() => {
    if (big) return
    let live = true
    readFile(cluster, path, (p) => live && setProgress(p))
      .then((d) => live && setData(d)).catch((e: Error) => live && setError(e.message))
    return () => { live = false }
  }, [cluster, path, big])
  if (big) {
    return <EmptyState icon={FileQuestion} title="Too big to show here"
      text="Download it to read it in a PDF app." action={onDownload && <Button onClick={onDownload}>Download</Button>} />
  }
  return (
    <div className="h-[70vh]">
      <ReadAloudPdf compact cluster={cluster} data={data} memory={`phone:${cluster}:${path}`} loading={!data && !error} progress={progress}
        message={error ? <EmptyState icon={FileQuestion} title="Can't show this PDF" text={error} /> : undefined} />
    </div>
  )
}
