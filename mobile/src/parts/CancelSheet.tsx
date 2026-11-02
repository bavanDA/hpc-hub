// Cancel a job: one short question with what you lose (the time it ran, what runs in it), from the bottom of the
// screen. Keep is the safe choice on the left, the confirm is solid red. HPC Hub's own node gets "Release node".
import { useEffect, useState } from 'react'

import { Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { Inside, Job } from '@shared/types/jobs'
import { BottomSheet, Button, useToast } from '../ui'

export function CancelSheet({ cluster, job: j, appNode: known, onClose, onDone }: {
  cluster: string; job: Job; appNode: boolean; onClose: () => void; onDone: () => void
}) {
  const toast = useToast()
  const [inside, setInside] = useState<Inside | null>(null)
  useEffect(() => {
    call<Inside>('jobs.inside', { cluster, job_id: j.job_id })
      .then(setInside)
      .catch(() => setInside({ sessions: [], app_node: false }))
  }, [cluster, j.job_id])

  const running = j.state === 'RUNNING'
  const appNode = known || !!inside?.app_node
  const node = j.where || `job ${j.job_id}`
  const name = j.name || `job ${j.job_id}`

  const confirm = () => {
    onClose()
    if (appNode) {
      toast(`Releasing node ${node}…`)
      call('clusters.release_node', { cluster })
        .then(() => toast(`Node ${node} is released`))
        .catch((e: Error) => toast(`Couldn't release node ${node}: ${e.message}`))
        .finally(onDone)
      return
    }
    toast(`Cancelling ${name}…`)
    call<{ gone: boolean }>('jobs.cancel', { cluster, job_id: j.job_id })
      .then(({ gone }) => toast(gone ? `${name} is cancelled` : `${name} is still stopping`))
      .catch((e: Error) => toast(`Couldn't cancel ${name}: ${e.message}`))
      .finally(onDone)
  }

  const sessions = inside?.sessions.length ? `These stop too: ${inside.sessions.join(', ')}.` : ''
  return (
    <BottomSheet onClose={onClose}>
      <h2 className="text-lg font-semibold">{appNode ? `Release node ${node}?` : `Cancel ${name}?`}</h2>
      <div className="flex flex-col gap-2 pt-1 text-dim">
        {appNode
          ? <p>Anything running on it stops. You stay connected, and your files stay where they are.</p>
          : <p>{running ? `It has run ${j.elapsed_text || '0 min'}. Its output so far stays in your folder.`
              : "It's still waiting in the queue. Nothing has started yet."}</p>}
        {sessions && <p>{sessions}</p>}
        {!inside && <p className="flex items-center gap-2 text-sm"><Spinner size={14} />Checking what runs in it…</p>}
      </div>
      <div className="mt-5 flex gap-3">
        <Button className="flex-1" onClick={onClose}>{appNode ? 'Keep it' : running ? 'Keep running' : 'Keep waiting'}
        </Button>
        <Button kind="danger" className="flex-1" disabled={!inside} onClick={confirm}>
          {appNode ? 'Release node' : 'Cancel job'}</Button>
      </div>
    </BottomSheet>
  )
}
