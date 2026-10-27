// The cluster's login: username and password, kept on the phone in the encrypted vault (vault_file.py).
import { useEffect, useState } from 'react'

import { call } from '@shared/rpc'
import type { Cluster, Logins } from '@shared/types/clusters'
import { Button, Field, Sheet, Switch, useToast } from '../ui'

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

  async function forget() {
    await call('clusters.forget_logins', { cluster: c.id }).catch((e: Error) => toast(e.message))
    onClose()
  }

  return (
    <Sheet title={`${c.name} login`} onClose={onClose} actions={<>
      <Button className="flex-1" onClick={forget}>Forget</Button>
      <Button kind="primary" className="flex-1" disabled={!user.trim()} onClick={save}>Save</Button></>}>
      {hint && <p className="mb-3 rounded-xl bg-warn-bg p-3 text-warn">{hint}</p>}
      <form onSubmit={(e) => { e.preventDefault(); save() }}>
        <Field label="Username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={user}
          onChange={(e) => setUser(e.target.value)} />
        <Field label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder={saved?.ssh.password ? 'Saved, leave empty to keep it' : 'Empty for an SSH key'} />
      </form>
      <Switch label="Remember the password" hint="Kept encrypted on this phone. Off: asked once per start."
        checked={remember} onChange={setRemember} />
    </Sheet>
  )
}
