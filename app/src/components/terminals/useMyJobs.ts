import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { Job, JobList } from '../../types/jobs'

const REFRESH_MS = 30_000

/** Your jobs on the cluster (squeue), read every 30 s while active; null until the first answer, and after a failed
 * read (the bar then shows the job without saying it ended). */
export function useMyJobs(cluster: string, active: boolean): Job[] | null {
  const [jobs, setJobs] = useState<Job[] | null>(null)
  useEffect(() => {
    if (!active || !cluster) return
    let stopped = false
    const read = () => call<JobList>('jobs.list', { cluster, scope: 'mine' })
      .then((d) => !stopped && setJobs(d.jobs))
      .catch(() => !stopped && setJobs(null))
    void read()
    const t = setInterval(() => document.visibilityState === 'visible' && void read(), REFRESH_MS)
    return () => { stopped = true; clearInterval(t) }
  }, [cluster, active])
  return jobs
}
