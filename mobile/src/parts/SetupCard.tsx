// The first thing on the Clusters screen while a cluster has no login: scan the desktop's code, or type one.
import { ScanQrCode } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { call } from '@shared/rpc'
import type { Cluster, Logins } from '@shared/types/clusters'
import { Button, Card, useToast } from '../ui'
import { LoginSheet } from './LoginSheet'
import { scanPairing } from './scanPairing'

export function SetupCard({ clusters }: { clusters: Cluster[] }) {
  const toast = useToast()
  const [missing, setMissing] = useState<Cluster[]>([])
  const [typing, setTyping] = useState<Cluster | null>(null)
  const check = useCallback(() => {
    Promise.all(clusters.map((c) => call<Logins>('clusters.login', { cluster: c.id })))
      .then((all) => setMissing(clusters.filter((_, i) => !all[i].ssh.username)))
      .catch((e: Error) => toast(e.message))
  }, [clusters, toast])
  useEffect(check, [check])

  async function scan() {
    const msg = await scanPairing()
    if (msg) toast(msg)
    check()
  }

  if (!missing.length && !typing) return null
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="text-lg font-bold">Log in from your computer</p>
        <p className="text-sm text-dim">On the computer, open HPC Hub's menu, then Set up the phone app, and scan
          the code. Nothing to type.</p>
      </div>
      <Button kind="primary" icon={ScanQrCode} onClick={scan}>Scan QR code</Button>
      {missing.length > 0 && <>
        <p className="mt-1 text-sm text-dim">Or type a username and password:</p>
        <div className="flex flex-wrap gap-2">
          {missing.map((c) => <Button key={c.id} className="flex-1" onClick={() => setTyping(c)}>{c.name}</Button>)}
        </div>
      </>}
      {typing && <LoginSheet cluster={typing} onClose={() => { setTyping(null); check() }} />}
    </Card>
  )
}
