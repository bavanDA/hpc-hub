import { RotateCw } from 'lucide-react'
import { useState } from 'react'

import { call } from '../../rpc'
import type { GlobusCluster } from '../../types/globus'
import { shortName } from '../clusters/loginCopy'
import { Row } from '../e/ui'
import { useToast } from '../toast'

// Restarting picks up every folder you have on the cluster now
export function RestartRow({ cluster: c }: { cluster: GlobusCluster }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const restart = () => {
    if (busy) return
    setBusy(true)
    toast(`Restarting Globus Connect on ${shortName(c)}…`)
    call('globus.start_personal', { cluster: c.id, restart: true })
      .then(() => toast(`Globus Connect is running on ${shortName(c)}`))
      .catch((e: Error) => toast(`Could not restart it: ${e.message}`))
      .finally(() => setBusy(false))
  }
  return <Row icon={RotateCw} label={busy ? `Restarting on ${shortName(c)}…` : `Restart on ${shortName(c)}`}
    onPress={restart} />
}
