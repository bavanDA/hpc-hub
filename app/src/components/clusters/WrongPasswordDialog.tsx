// The cluster refused the password (it asked a second time, and the app stopped so your account isn't locked):
// say so plainly, with the username it was for, and let you type it again and try again right here.
import { KeyRound } from 'lucide-react'
import { useState } from 'react'

import { call } from '../../rpc'
import type { Cluster } from '../../types/clusters'
import { EDialog } from '../e/EDialog'
import { Field } from '../e/Field'
import { MainButton } from '../e/MainButton'
import { useLogin } from './useLogin'

export function WrongPasswordDialog({ cluster: c, detail, onClose }:
  { cluster: Cluster; detail: string; onClose: () => void }) {
  const login = useLogin(c.id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const label = c.username_label ?? 'Username'

  async function retry() {
    setBusy(true)
    setError('')
    try {
      await login.save()
      await call('clusters.connect', { cluster: c.id })
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <EDialog title="Wrong password" icon={KeyRound} onClose={onClose}
      actions={<MainButton disabled={busy || !login.user.trim() || !login.password} onClick={retry}>
        {busy ? 'Trying…' : 'Try again'}</MainButton>}>
      <form className="flex flex-col gap-1 px-5" onSubmit={(e) => { e.preventDefault(); if (login.password) retry() }}>
        <p role="alert" className="mb-2 rounded-lg bg-bad-bg px-3 py-2 font-semibold text-bad">{detail}</p>
        <Field label={label} value={login.user} onChange={(e) => login.setUser(e.target.value)} autoComplete="off" />
        <Field label="Password" type="password" value={login.password} autoFocus
          onChange={(e) => login.setPassword(e.target.value)} />
        <p className="text-sm text-dim">HPC Hub stopped after one try, so your account isn't locked.</p>
        {error && <p role="alert" className="pt-1 font-semibold text-bad">{error}</p>}
      </form>
    </EDialog>
  )
}
