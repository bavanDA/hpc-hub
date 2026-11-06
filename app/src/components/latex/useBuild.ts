import { useRef, useState } from 'react'

import { useEvent } from '../../hooks'
import { call } from '../../rpc'
import type { BuildDone } from '../../types/latex'
import { useToast } from '../toast'

/** `guard` asks for a compute node first when the build should run on one. */
export function useBuild({ cluster, main, save, guard, onDone }: { cluster: string; main: string
  save: () => Promise<boolean>; guard: (run: () => void) => void; onDone: (d: BuildDone) => void }) {
  const toast = useToast()
  const [running, setRunningState] = useState<string | null>(null)
  const [log, setLog] = useState('')
  const [last, setLast] = useState<BuildDone | null>(null)
  const runningRef = useRef<string | null>(null)  // the build id, or 'starting' before the call answers
  const setRunning = (id: string | null) => { runningRef.current = id; setRunningState(id) }
  const logs = useRef<Record<string, string>>({})  // log text by build id, also before we know our id

  const finish = (d: BuildDone) => {
    delete logs.current[d.id]
    setRunning(null)
    setLast(d)
    setLog(d.log)
    onDone(d)
  }

  const run = async () => {
    if (runningRef.current || !(await save())) return
    setLog('')
    setRunning('starting')
    try {
      const r = await call<{ id: string; done?: BuildDone }>('latex.build', { cluster, main })
      if (r.done) { finish(r.done); return }
      setRunning(r.id)
      setLog(logs.current[r.id] ?? '')
    } catch (e) {
      setRunning(null)
      toast(`Could not build: ${(e as Error).message}`)
    }
  }
  const build = () => { if (!runningRef.current) guard(() => void run()) }
  const stop = () => { if (running && running !== 'starting') void call('latex.stop', { id: running }) }

  useEvent<{ id: string; text: string }>('latex-log', ({ id, text }) => {
    logs.current[id] = (logs.current[id] ?? '') + text
    if (id === runningRef.current) setLog(logs.current[id])
  })
  useEvent<BuildDone>('latex-build', (d) => {
    if (d.cluster === cluster && d.main === main) finish(d)
  })

  return { running: !!running, log, last, build, stop }
}
