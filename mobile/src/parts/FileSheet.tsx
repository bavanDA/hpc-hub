// A file from the cluster, read-only: text, images and PDFs (one page at a time is still to come on the phone).
import { useEffect, useState } from 'react'

import { Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { FileData } from '@shared/types/files'
import { Sheet, useToast } from '../ui'

const LIMIT = 2 * 1024 * 1024

export function FileSheet({ cluster, path, onClose }: { cluster: string; path: string; onClose: () => void }) {
  const toast = useToast()
  const [file, setFile] = useState<FileData | null>(null)
  useEffect(() => {
    call<FileData>('files.read', { cluster, path, limit: LIMIT }).then(setFile)
      .catch((e: Error) => { toast(e.message); onClose() })
  }, [cluster, path, toast, onClose])

  return (
    <Sheet title={path.split('/').pop() ?? path} onClose={onClose}>
      {!file && <div className="grid h-40 place-items-center"><Spinner size={28} /></div>}
      {file?.kind === 'text' && (
        <pre className="select-text whitespace-pre-wrap break-all font-mono text-[13px] leading-snug">
          {file.text}{file.cut && '\n\n(cut here: the file goes on)'}</pre>
      )}
      {file?.kind === 'image' && <img src={`data:${file.mime};base64,${file.data}`} alt="" className="mx-auto" />}
      {file?.kind === 'pdf' && <p className="text-dim">PDF preview is not on the phone yet.</p>}
      {file?.kind === 'binary' && <p className="text-dim">This file can't be shown.</p>}
    </Sheet>
  )
}
