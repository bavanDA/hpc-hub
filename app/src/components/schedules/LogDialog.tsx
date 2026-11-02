// The newest answer a scheduled agent wrote (the end of it, when long). Style E, like the phone's LogSheet.
import { useEffect, useState } from 'react'

import { useGo } from '../../nav'
import { call } from '../../rpc'
import type { ScheduleLog } from '../../types/schedules'
import { EButton } from '../e/extra'
import { EDialog } from '../e/ui'
import { Spinner } from '../ui'

export function LogDialog({ cluster, name, onClose }: { cluster: string; name: string; onClose: () => void }) {
  const [log, setLog] = useState<ScheduleLog | null>(null)
  const [error, setError] = useState('')
  const go = useGo()
  useEffect(() => {
    call<ScheduleLog>('schedules.log', { cluster, name }).then(setLog).catch((e: Error) => setError(e.message))
  }, [cluster, name])
  return (
    <EDialog title={`Last answer of ${name}`} width={720} onClose={onClose}
      actions={log && <EButton className="w-full" onClick={() => { onClose(); go('files', { cluster, path: log.folder }) }}>
        Open the logs folder</EButton>}>
      <div className="px-5 pb-2">
        {error ? <p className="py-6 text-center text-bad">{error}</p>
          : !log ? <div className="grid h-40 place-items-center"><Spinner size={20} /></div>
            : !log.path ? <p className="py-6 text-center text-dim">It hasn't run yet. Answers go to {log.folder}.</p>
              : <>
                  <p className="mb-2 text-sm break-all text-dim">{log.path}</p>
                  <pre className="max-h-[60vh] overflow-auto rounded-lg bg-soft p-4 font-mono text-sm whitespace-pre-wrap
                    select-text">{log.text || 'The answer is empty.'}</pre>
                </>}
      </div>
    </EDialog>
  )
}
