// A cluster's logins, saved in the system keyring. Passwords go in and never come back out.
import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { Cluster, Logins } from '../../types/clusters'
import { useToast } from '../toast'
import { Button, Dialog } from '../ui'
import { EntryRow, Group, SwitchRow } from './fields'
import { putCluster } from './store'

export function SettingsDialog({ cluster: c, hint, onClose }:
  { cluster: Cluster; hint?: string; onClose: () => void }) {
  const toast = useToast()
  const [saved, setSaved] = useState<Logins | null>(null)
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [same, setSame] = useState(c.vpn.same_login_as_ssh ?? true)
  const [vpnUser, setVpnUser] = useState('')
  const [vpnPassword, setVpnPassword] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    call<Logins>('clusters.login', { cluster: c.id })
      .then((l) => { setSaved(l); setUser(l.ssh.username); setVpnUser(l.vpn.username) })
      .catch((e: Error) => toast(e.message))
  }, [c.id, toast])

  async function save() {
    setBusy(true)
    try {
      if (user.trim()) await call('clusters.set_login', { cluster: c.id, kind: 'ssh', username: user, password })
      if (c.vpn.enabled && same !== (c.vpn.same_login_as_ssh ?? true)) {
        const changes = { vpn: { same_login_as_ssh: same } }
        putCluster(await call<Cluster>('clusters.update', { cluster: c.id, changes }))
      }
      if (c.vpn.enabled && !same && vpnUser.trim()) {
        await call('clusters.set_login', { cluster: c.id, kind: 'vpn', username: vpnUser, password: vpnPassword })
      }
      toast(`${c.name} settings saved`)
      onClose()
    } catch (e) {
      toast((e as Error).message)
      setBusy(false)
    }
  }

  async function forget() {
    try {
      await call('clusters.forget_logins', { cluster: c.id })
      setSaved({ ssh: { username: '', password: false }, vpn: { username: '', password: false } })
      setUser(''); setPassword(''); setVpnUser(''); setVpnPassword('')
      toast('Saved logins removed')
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <Dialog title={`${c.name} settings`} onClose={onClose} width={520}
      actions={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button kind="suggested" disabled={busy || !saved} onClick={save}>Save</Button>
      </>}>
      {hint && <p className="mb-4 rounded-lg bg-warn-bg px-4 py-2.5 text-[14px] font-bold text-warn">{hint}</p>}
      <Group title="Cluster login"
        description="Stored only in your system keyring. Leave the password empty if you log in with an SSH key.">
        <EntryRow label="Username" value={user} onChange={setUser} autoFocus placeholder="jdoe" />
        <EntryRow label={saved?.ssh.password ? 'Password (saved, leave empty to keep)' : 'Password'}
          value={password} onChange={setPassword} password />
      </Group>
      {c.vpn.enabled && (
        <Group title="VPN login" description={`For ${c.vpn.gateway || 'the VPN'}.`}>
          <SwitchRow label="Same login as cluster" checked={same} onChange={setSame} />
          {!same && <>
            <EntryRow label="VPN username" value={vpnUser} onChange={setVpnUser} placeholder="jdoe@example.edu" />
            <EntryRow label={saved?.vpn.password ? 'VPN password (saved, leave empty to keep)'
              : 'VPN password (empty = cluster password)'} value={vpnPassword} onChange={setVpnPassword} password />
          </>}
        </Group>
      )}
      <button type="button" onClick={forget}
        className="mb-2 h-12 w-full rounded-xl bg-card font-bold text-bad shadow-[var(--shadow-card)] hover:bg-hover">
        Forget saved logins
      </button>
    </Dialog>
  )
}
