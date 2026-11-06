import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { FileData } from '../../types/files'
import { Dialog } from '../ui/Dialog'
import { Spinner } from '../ui/Spinner'
import { basename } from './format'

export function ImageDialog({ cluster, path, onClose }: { cluster: string; path: string; onClose: () => void }) {
  const [data, setData] = useState<FileData | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    call<FileData>('files.read', { cluster, path }).then(setData).catch((e: Error) => setError(e.message))
  }, [cluster, path])
  return (
    <Dialog title={basename(path)} onClose={onClose} width={900}>
      <div className="grid min-h-[300px] place-items-center">
        {error ? <p className="text-bad">{error}</p> : !data ? <Spinner size={24} />
          : <img src={`data:${data.mime};base64,${data.data}`} alt="" className="max-h-[75vh] object-contain" />}
      </div>
    </Dialog>
  )
}
