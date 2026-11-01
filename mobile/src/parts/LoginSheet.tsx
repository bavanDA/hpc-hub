// The cluster's login: scanned from the desktop app's QR code (scanPairing.ts), or typed here. Kept on the phone
// in the encrypted vault (vault_file.py).
import { ScanQrCode } from 'lucide-react'
import { useEffect, useState } from 'react'

import { call } from '@shared/rpc'
import type { Cluster, Logins } from '@shared/types/clusters'
import { Button, Field, Sheet, Switch, useToast } from '../ui'
import { scanPairing } from './scanPairing'

export function LoginSheet({ cluster: c, hint, onClose }: { cluster: Cluster; hint?: string; onClose: () => void }) {
  const toast = useToast()
  const [saved, setSaved] = useState<Logins | null>(null)
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  useEffect(() => {
    call<Logins>('clusters.login', { cluster: c.id }).then((l) => {
      setSaved(l)
      setUser(l.ssh.username)
      setRemember(l.remember ?? true)
    }).catch((e: Error) => toast(e.message))
  }, [c.id, toast])

  async function save() {
    try {
      await call('clusters.set_login', { cluster: c.id, kind: 'ssh', username: user, password, remember })
      onClose()
    } catch (e) {
      toast((e as Error).message)
    }
  }

  async function scan() {
    const { msg, names } = await scanPairing()
    if (msg) toast(msg)
    if (names.length) onClose()
  }

  async function forget() {
    await call('clusters.forget_logins', { cluster: c.id }).catch((e: Error) => toast(e.message))
    onClose()
  }

  return (
    <Sheet title={`Sign in to ${c.name}`} onClose={onClose} actions={<>
      <Button className="flex-1" onClick={forget}>Forget password</Button>
      <Button kind="primary" className="flex-1" disabled={!user.trim()} onClick={save}>Save</Button></>}>
      {hint && <p className="mb-3 rounded-xl bg-warn-bg p-3 text-warn">{hint}</p>}
      <Button kind="primary" icon={ScanQrCode} className="w-full" onClick={scan}>Scan QR code</Button>
      <p className="mt-2 text-sm text-dim">On the computer, open HPC Hub's menu, then Set up the phone app.</p>
      <p className="mb-2 mt-5 text-sm font-bold text-dim">Or type it</p>
      <form onSubmit={(e) => { e.preventDefault(); save() }}>
        <Field label="Username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={user}
          onChange={(e) => setUser(e.target.value)} />
        <Field label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder={saved?.ssh.password ? 'Saved, leave empty to keep it' : 'Empty for an SSH key'} />
      </form>
      <p className="mb-1 text-sm text-dim">Saved encrypted on this phone, never in plain text.</p>
      <Switch label="Remember password" hint="Off: asked once each time the app starts."
        checked={remember} onChange={setRemember} />
    </Sheet>
  )
}
