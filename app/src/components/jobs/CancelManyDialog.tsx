import { call } from '../../rpc'
import type { Job } from '../../types/jobs'
import { useToast } from '../toast'
import { AlertDialog } from '../ui'
import { nameList } from './format'

/** Cancel several of your jobs at once: one question naming them, then one scancel each. */
export function CancelManyDialog({ cluster, jobs, appJob, onClose, onDone }: {
  cluster: string; jobs: Job[]; appJob: string; onClose: () => void; onDone: () => void
}) {
  const toast = useToast()
  const n = jobs.length
  const node = jobs.find((j) => j.job_id === appJob && j.state === 'RUNNING')
  const confirm = () => {
    onClose()
    toast(`Cancelling ${n} jobs…`)
    Promise.allSettled(jobs.map((j) => call('jobs.cancel', { cluster, job_id: j.job_id })))
      .then((all) => {
        const failed = all.filter((r) => r.status === 'rejected').length
        toast(failed ? `${n - failed} of ${n} jobs cancelled. ${failed} could not be cancelled` : `${n} jobs cancelled`)
      })
      .finally(onDone)
  }
  return (
    <AlertDialog title={`Cancel ${n} jobs?`} keep="Keep them" act={`Cancel ${n} jobs`} onAct={confirm}
      onClose={onClose}>
      <p>{nameList(jobs.map((j) => j.name || `job ${j.job_id}`))}</p>
      <p>{!jobs.some((j) => j.state === 'RUNNING') ? "They're still waiting in the queue. Nothing has started yet."
        : jobs.every((j) => j.state === 'RUNNING') ? 'They stop now. Their output so far stays in your folders.'
          : 'The running ones stop now and keep their output so far. The waiting ones leave the queue.'}</p>
      {node && <p>One of them is HPC Hub&apos;s node {node.where}. Your terminals on it stop too.</p>}
    </AlertDialog>
  )
}
