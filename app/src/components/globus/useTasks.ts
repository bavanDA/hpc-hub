import { useCallback, useRef, useState, type RefObject } from 'react'

import { call } from '../../rpc'
import type { Task } from '../../types/globus'
import type { Pane } from './usePane'

export function useTasks(panes: RefObject<Pane[]>) {
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [error, setError] = useState('')
  const seenActive = useRef(new Set<string>())

  const load = useCallback(() => {
    call<Task[]>('globus.tasks').then((all) => {
      setTasks(all)
      setError('')
      if (all.some((t) => t.status === 'SUCCEEDED' && seenActive.current.has(t.task_id))) {
        panes.current.forEach((p) => p.reload())  // a copy landed: show it
      }
      seenActive.current = new Set(all.filter((t) => t.active).map((t) => t.task_id))
    }).catch((e: Error) => setError(e.message))
  }, [panes])

  return { tasks, error, load }
}
