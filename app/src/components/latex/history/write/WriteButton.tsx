import { Sparkles } from 'lucide-react'

import { Button } from '../../../ui/Button'
import { Spinner } from '../../../ui/Spinner'
import { Seconds } from '../ui/Seconds'
import type { Assist } from '../useAssist'

export function WriteButton({ assist }: { assist: Assist }) {
  const job = assist.running('write')
  const waiting = assist.waitingFor === 'write'
  return (
    <Button onClick={assist.write} disabled={!!job || waiting || !assist.choice}
      title="The agent reads your changes and writes a message for you to check. It never commits.">
      {job ? <><Spinner size={14} /> Writing, <Seconds from={job.started} /></>
        : waiting ? <><Spinner size={14} /> Waiting for a node</> : <><Sparkles size={15} /> Write message</>}
    </Button>
  )
}
