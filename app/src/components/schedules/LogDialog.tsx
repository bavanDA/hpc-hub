// The newest answer a scheduled agent wrote (the end of it, when long).
import { useEffect, useState } from 'react'

import { useGo } from '../../nav'
import { call } from '../../rpc'
import type { ScheduleLog } from '../../types/schedules'
import { Button, Dialog, Spinner } from '../ui'

export function LogDialog({ cluster, name, onClose }: { cluster: string; name: string; onClose: () => void }) {
  const [log, setLog] = useState<ScheduleLog | null>(null)
  const [error, setError] = useState('')
  const go = useGo()
  useEffect(() => {
    call<ScheduleLog>('schedules.log', { cluster, name }).then(setLog).catch((e: Error) => setError(e.message))
  }, [cluster, name])
  return (
    <Dialog title={`Last answer of ${name}`} onClose={onClose} width={720}
      actions={<>
        {log && <Button onClick={() => { onClose(); go('files', { cluster, path: log.folder }) }}>
          Open logs folder</Button>}
        <Button onClick={onClose}>Close</Button>
      </>}>
      {error ? <p className="py-6 text-center text-bad">{error}</p>
        : !log ? <div className="grid h-40 place-items-center"><Spinner size={20} /></div>
          : !log.path ? <p className="py-6 text-center text-dim">
              It has not run yet.</p>
            : <div className="flex flex-col gap-2">
                <p className="truncate text-sm text-dim" title={log.path}>{log.path}</p>
                <pre className="max-h-[60vh] overflow-auto rounded-lg bg-view p-4 font-mono text-sm
                  whitespace-pre-wrap select-text">{log.text || 'The answer is empty.'}</pre>
              </div>}
    </Dialog>
  )
}
