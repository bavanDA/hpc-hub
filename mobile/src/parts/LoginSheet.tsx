// A cluster's sign-in on the phone: scanned from the desktop app's QR code (scanPairing.ts), or typed here. Kept on
// the phone in the encrypted vault (vault_file.py). The words are the desktop's (loginCopy.ts).
import { ScanQrCode } from 'lucide-react'
import { useEffect, useState } from 'react'

import { copy, who } from '@shared/components/clusters/loginCopy'
import { call } from '@shared/rpc'
import { secondStep, type Cluster, type Logins } from '@shared/types/clusters'
import { Button, ConfirmSheet, Field, Sheet, Switch, useToast } from '../ui'
import { AuthenticatorSheet } from './AuthenticatorSheet'
import { scanPairing } from './scanPairing'

export function LoginSheet({ cluster: c, hint, onClose }: { cluster: Cluster; hint?: string; onClose: () => void }) {
  const toast = useToast()
  const [saved, setSaved] = useState<Logins | null>(null)
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [ask, setAsk] = useState<'' | 'forget' | 'code'>('')
  const label = c.username_label || 'Username'
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
    try {
      await call('clusters.forget_logins', { cluster: c.id, keep_username: true })
      setPassword('')
      setSaved((s) => s && { ...s, ssh: { ...s.ssh, password: false } })
      toast('Password forgotten')
    } catch (e) {
      toast((e as Error).message)
    }
  }

  if (ask === 'code') return <AuthenticatorSheet cluster={c} onClose={() => setAsk('')} />
  return (
    <Sheet title={copy.signIn(c)} onClose={onClose} actions={
      <Button kind="primary" className="flex-1" disabled={!user.trim()} onClick={save}>Save</Button>}>
      {hint && <p className="mb-3 rounded-xl bg-warn-bg p-3 text-warn">{hint}</p>}
      <Button kind="primary" icon={ScanQrCode} className="w-full" onClick={scan}>Scan from your computer</Button>
      <p className="mt-2 text-sm text-dim">On the computer, open HPC Hub's menu, then Set up the phone app.</p>
      <p className="mb-1 mt-6 text-sm font-bold text-dim">Or type it</p>
      <form onSubmit={(e) => { e.preventDefault(); save() }}>
        <Field label={label} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username"
          placeholder={copy.usernameHint} value={user} onChange={(e) => setUser(e.target.value)} />
        <Field label={copy.password} type="password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={saved?.ssh.password ? copy.saved : c.password_only ? '' : 'Empty for an SSH key'} />
      </form>
      <p className="text-sm text-dim">Kept encrypted on this phone. Changing it here doesn't change your {who(c)} password.</p>
      <Switch label={copy.remember} hint={remember ? undefined : copy.rememberOff} checked={remember}
        onChange={setRemember} />
      {c.second_factor === 'code' && <>
        <p className="mt-2 text-sm text-dim">{secondStep(c)}</p>
        {c.code_setup && <button onClick={() => setAsk('code')} className="h-11 font-semibold text-accent-text">
          {copy.codeSetup}</button>}
      </>}
      {saved?.ssh.password && <button onClick={() => setAsk('forget')}
        className="mt-4 block h-11 font-semibold text-bad">{copy.forget}</button>}
      {ask === 'forget' && <ConfirmSheet title={copy.forgetTitle(c)} text={copy.forgetBody(label)} confirm={copy.forget}
        keep="Keep it" danger onConfirm={forget} onClose={() => setAsk('')} />}
    </Sheet>
  )
}
