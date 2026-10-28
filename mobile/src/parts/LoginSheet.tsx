// The cluster's login: sign in on its web portal (the app adds this phone's SSH key there, no password kept), or
// username and password, kept on the phone in the encrypted vault (vault_file.py).
import { invoke } from '@tauri-apps/api/core'
import { Globe } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Spinner } from '@shared/components/ui'

import { call } from '@shared/rpc'
import type { Cluster, Logins } from '@shared/types/clusters'
import { Button, Field, Sheet, Switch, useToast } from '../ui'

export function LoginSheet({ cluster: c, hint, onClose }: { cluster: Cluster; hint?: string; onClose: () => void }) {
  const toast = useToast()
  const [saved, setSaved] = useState<Logins | null>(null)
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [web, setWeb] = useState(false)
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

  // the portal's sign-in cookie (ood.py COOKIES): set once you are signed in
  async function signInOnWeb() {
    try {
      const cookies = await invoke<Record<string, string>>('web_sign_in', {
        url: `${c.portal}/pun/sys/dashboard`, title: `${c.name} portal`, cookies: ['mod_auth_openidc_session'] })
      setWeb(true)
      const r = await call<{ user: string; added: boolean }>('keysetup.with_cookies', { cluster: c.id, cookies })
      toast(`Signed in as ${r.user}. ${r.added ? "This phone's key was added." : 'The key was there already.'}`)
      onClose()
    } catch (e) {
      toast(String((e as Error).message ?? e))
    } finally {
      setWeb(false)
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
      {c.portal && (
        <div className="mb-5">
          <Button kind="primary" icon={web ? undefined : Globe} className="w-full" disabled={web} onClick={signInOnWeb}>
            {web ? <><Spinner /> Adding this phone's key</> : 'Sign in on the web'}</Button>
          <p className="mt-2 text-sm text-dim">Sign in on {c.name}'s portal. The app adds this phone's SSH key to your
            account, so no password is kept. {c.second_factor === 'code' ? 'The cluster still asks for its code.' : ''}</p>
          <p className="mt-5 text-sm font-bold text-dim">Or type your login</p>
        </div>
      )}
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
