import { useEffect, useState, type ReactNode } from 'react'

import { call } from '../../rpc'
import type { Cluster, SettingsInfo } from '../../types/clusters'
import { ConfirmDialog } from '../e/ConfirmDialog'
import { DialogNote } from '../e/DialogNote'
import { EDialog } from '../e/EDialog'
import { MainButton } from '../e/MainButton'
import { useToast } from '../useToast'
import { AuthenticatorHelp } from './AuthenticatorHelp'
import { KeySetupDialog } from './KeySetupDialog'
import { copy, shortName } from './loginCopy'
import { AgentsPart } from './settings/AgentsPart'
import { changes, firstPart, ownVpnLogin, TITLES, type Part } from './settings/changes'
import { ComputePart } from './settings/ComputePart'
import { LoginPart } from './settings/LoginPart'
import { Overview } from './settings/Overview'
import { ServerPart } from './settings/ServerPart'
import { VsCodePart } from './settings/VsCodePart'
import { putCluster, useClusters } from './store'
import { useLogin } from './useLogin'

/** start: '' for the list, or a section ('login', 'compute', 'server', 'queues', 'vscode', 'agents'). */
export function SettingsDialog({ cluster, hint, onClose, start = '', advanced = false }:
  { cluster: Cluster; hint?: string; onClose: () => void; start?: string; advanced?: boolean }) {
  const toast = useToast()
  const session = useClusters().sessions[cluster.id]
  const [part, setPart] = useState<Part>(() => firstPart(start, advanced))
  const [entry] = useState<Part>(part)  // opened straight at a section: Save is there, not Done
  const [d, setD] = useState<Cluster>(cluster)
  const [info, setInfo] = useState<SettingsInfo | null>(null)
  const login = useLogin(cluster.id)
  const { saved, user, remember } = login
  const [vpnTyped, setVpnUser] = useState<string | null>(null)  // null: the saved one
  const vpnUser = vpnTyped ?? saved?.vpn.username ?? ''
  const [vpnPassword, setVpnPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // no login yet on a cluster with a portal: set it up there
  const [open, setOpen] = useState<null | 'key' | 'code' | 'forget' | 'leave'>(hint && cluster.portal ? 'key' : null)
  const [base, setBase] = useState<Cluster | null>(null)

  useEffect(() => {
    call<SettingsInfo>('cluster_settings.get', { cluster: cluster.id })
      .then((got) => { setInfo(got); setD(got.cluster); setBase(got.cluster) }).catch((e: Error) => setError(e.message))
  }, [cluster.id])

  const up = (change: Partial<Cluster>) => setD((x) => ({ ...x, ...change }))
  const changed = (!!base && JSON.stringify(d) !== JSON.stringify(base)) || login.changed || !!vpnPassword
    || (!!saved && vpnUser !== saved.vpn.username)
  const close = () => (changed ? setOpen('leave') : onClose())
  const label = d.username_label || 'Username'

  async function save() {
    setBusy(true)
    setError('')
    try {
      putCluster(await call<Cluster>('cluster_settings.save', { cluster: d.id, changes: changes(d, info?.agents) }))
      if (user.trim()) await login.save()
      if (ownVpnLogin(d.vpn) && vpnUser.trim()) {
        await call('clusters.set_login', { cluster: d.id, kind: 'vpn', username: vpnUser, password: vpnPassword,
          remember })
      }
      toast(`${shortName(d)} settings saved`)
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  async function forget() {
    try {
      const keep = !d.key_page  // a key cluster has no password: forgetting means the username
      await call('clusters.forget_logins', { cluster: d.id, keep_username: keep })
      if (keep) login.setSaved((s) => s && { ...s, ssh: { ...s.ssh, password: false }, vpn: { ...s.vpn, password: false } })
      else {
        login.setSaved((s) => ({ ...s, ssh: { username: '', password: false }, vpn: { username: '', password: false } }))
        login.setUser(''); setVpnUser('')
      }
      login.setPassword(''); setVpnPassword('')
      toast(keep ? 'Saved password removed' : `${label} forgotten`)
    } catch (e) {
      toast((e as Error).message)
    }
  }

  function keyDone(name: string) {
    setOpen(null)
    onClose()
    toast(`Signed in as ${name}. Connecting to ${shortName(d)}`)
    call('clusters.connect', { cluster: d.id }).catch((e: Error) => toast(e.message))
  }

  const vpnLogin = { user: vpnUser, setUser: setVpnUser, password: vpnPassword, setPassword: setVpnPassword,
    saved: !!saved?.vpn.password }
  const pages: Record<Part, ReactNode> = {
    '': <Overview d={d} info={info} user={user} open={setPart} onAuthenticator={() => setOpen('code')} />,
    login: <LoginPart d={d} login={login} onPortal={() => setOpen('key')} onForget={() => setOpen('forget')}
      signedIn={!!session && (session.connected ?? session.state === 'Connected')} />,
    compute: <ComputePart d={d} up={up} />,
    server: <ServerPart d={d} info={info} up={up} vpnLogin={vpnLogin} />,
    vscode: <VsCodePart d={d} up={up} />,
    agents: <AgentsPart d={d} agents={info?.agents ?? []} up={up} />,
  }
  const back = () => setPart('')
  return (
    <>
      <EDialog title={part ? TITLES[part] : `${cluster.name} settings`} width={580} onClose={close}
        onBack={part ? back : undefined}
        actions={part && part !== entry ? <MainButton onClick={back}>Done</MainButton>
          : <MainButton disabled={busy || !saved || !info} onClick={save}>Save</MainButton>}>
        {hint && (part === '' || part === 'login') && <DialogNote>{hint}</DialogNote>}
        {(error || login.failed) && <DialogNote error>{error || login.failed}</DialogNote>}
        <div className="pb-3">{pages[part]}</div>
      </EDialog>
      {open === 'leave' && <ConfirmDialog title="Throw away your changes?" danger keep="Keep editing"
        confirm="Throw away" onClose={() => setOpen(null)} onConfirm={onClose} />}
      {open === 'key' && <KeySetupDialog cluster={d} onClose={() => setOpen(null)} onDone={keyDone} />}
      {open === 'code' && <AuthenticatorHelp cluster={d} onClose={() => setOpen(null)} />}
      {open === 'forget' && <ConfirmDialog danger title={d.key_page ? `Forget your ${label}?` : copy.forgetTitle(d)}
        keep={copy.keep} confirm={d.key_page ? `Forget ${label}` : copy.forget} onConfirm={forget}
        onClose={() => setOpen(null)}
        text={d.key_page ? "You'll type it next time you connect. Your key stays on this computer."
          : copy.forgetBody(label)} />}
    </>
  )
}
