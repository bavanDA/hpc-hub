import { useState } from 'react'

import { useEvent } from '../../../hooks'
import type { GitJob } from '../../../types/history'

/** Steps of a switch or a push, as `latex-git` events for one job id. */
export function useJob(id: string | null, onEnd: (j: GitJob) => void): GitJob | null {
  const [job, setJob] = useState<GitJob | null>(null)
  useEvent<GitJob>('latex-git', (j) => {
    if (!id || j.id !== id) return
    setJob(j)
    if (j.done) onEnd(j)
  })
  return job && job.id === id ? job : null
}
