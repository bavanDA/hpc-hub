// One cluster's settings, the desktop's window (components/clusters/SettingsDialog.tsx) with the phone's Back and
// sign-in form. Each row opens a section of the same window; Sign in from ⋮ opens at that section.
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react'

import { QueueWindow } from '@shared/components/clusters/node/QueueDialog'
import { copy, shortName } from '@shared/components/clusters/loginCopy'
import { AgentsPart } from '@shared/components/clusters/settings/AgentsPart'
import { changes, firstPart, ownVpnLogin, TITLES, type Part } from '@shared/components/clusters/settings/changes'
import { ComputePart } from '@shared/components/clusters/settings/ComputePart'
import { Overview } from '@shared/components/clusters/settings/Overview'
import { ServerPart } from '@shared/components/clusters/settings/ServerPart'
import { VsCodePart } from '@shared/components/clusters/settings/VsCodePart'
import { putCluster, useClusters } from '@shared/components/clusters/store'
import { useLogin } from '@shared/components/clusters/useLogin'
import { AuthenticatorHelp } from '@shared/components/clusters/AuthenticatorHelp'
import { ChoiceRow as DesktopChoiceRow } from '@shared/components/e/ChoiceRow'
import { DialogNote } from '@shared/components/e/DialogNote'
import { call } from '@shared/rpc'
import type { Cluster, SettingsInfo } from '@shared/types/clusters'
import { BackLayer, ConfirmDialog, Dialog, MainButton, PickDialog, Row, Section, useToast } from '../../ui'
import { LoginForm } from './LoginForm'
import { QueueDialog } from './QueueDialog'

/** The desktop's ChoiceRow with the phone's list window. */
function ChoiceRow<T extends string>({ label, sub, value, options, onChange }: ComponentProps<typeof DesktopChoiceRow<T>>) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Row label={label} sub={sub} value={options.find((o) => o.value === value)?.label ?? 'Default'} opens
        onPress={() => setOpen(true)} />
      {open && <PickDialog title={label} options={options} value={value} onPick={onChange}
        onClose={() => setOpen(false)} />}
    </>
  )
}

/** start: '' for the list, or a section ('login', 'compute'). */
export function SettingsWindow({ cluster, hint, onClose, start = '' }:
  { cluster: Cluster; hint?: string; onClose: () => void; start?: string }) {
  const toast = useToast()
  const session = useClusters().sessions[cluster.id]
  const [part, setPart] = useState<Part>(() => firstPart(start, false))
  const [entry] = useState<Part>(part)  // opened straight at a section: Save is there, not Done
  const [d, setD] = useState<Cluster>(cluster)
  const [base, setBase] = useState<Cluster | null>(null)
  const [info, setInfo] = useState<SettingsInfo | null>(null)
  const login = useLogin(cluster.id)
  const { saved, user, remember } = login
  const [vpnTyped, setVpnUser] = useState<string | null>(null)  // null: the saved one
  const vpnUser = vpnTyped ?? saved?.vpn.username ?? ''
  const [vpnPassword, setVpnPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<null | 'code' | 'forget' | 'leave'>(null)

  useEffect(() => {
    call<SettingsInfo>('cluster_settings.get', { cluster: cluster.id })
      .then((got) => { setInfo(got); setD(got.cluster); setBase(got.cluster) }).catch((e: Error) => setError(e.message))
  }, [cluster.id])

  const up = (change: Partial<Cluster>) => setD((x) => ({ ...x, ...change }))
  const changed = (!!base && JSON.stringify(d) !== JSON.stringify(base)) || login.changed || !!vpnPassword
    || (!!saved && vpnUser !== saved.vpn.username)
  const close = () => (changed ? setOpen('leave') : onClose())
  const back = () => setPart('')
  const label = d.username_label || 'Username'

  async function save() {
    setBusy(true)
    setError('')
    try {
      putCluster(await call<Cluster>('cluster_settings.save', { cluster: d.id, changes: changes(d, info?.agents) }))
      if (user.trim()) await login.save()
      if (ownVpnLogin(d.vpn) && vpnUser.trim()) {
        await call('clusters.set_login', { cluster: d.id, kind: 'vpn', username: vpnUser, password: vpnPassword, remember })
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

  const forgetRow = (d.key_page ? !!saved?.ssh.username : !!saved?.ssh.password) && (
    <Section><Row label={d.key_page ? `Forget ${label}` : copy.forget} danger onPress={() => setOpen('forget')} /></Section>)
  const vpnLogin = { user: vpnUser, setUser: setVpnUser, password: vpnPassword, setPassword: setVpnPassword,
    saved: !!saved?.vpn.password }
  const pages: Record<Part, ReactNode> = {
    '': <Overview d={d} info={info} user={user} open={setPart} onAuthenticator={() => setOpen('code')} />,
    login: <LoginForm cluster={d} login={login} onScanned={onClose}
      signedIn={!!session && (session.connected ?? session.state === 'Connected')}>{forgetRow}</LoginForm>,
    compute: <ComputePart d={d} up={up} />,
    server: <ServerPart d={d} info={info} up={up} vpnLogin={vpnLogin} Choice={ChoiceRow} />,
    vscode: <VsCodePart d={d} up={up} />,
    agents: <AgentsPart d={d} agents={info?.agents ?? []} up={up} />,
  }
  return (
    <QueueWindow.Provider value={QueueDialog}>
      <Dialog title={part ? TITLES[part] : `${cluster.name} settings`} onClose={close}
        onBack={part ? back : undefined}
        actions={part && part !== entry ? <MainButton onClick={back}>Done</MainButton>
          : <MainButton disabled={busy || !saved || !info} onClick={save}>Save</MainButton>}>
        {hint && (part === '' || part === 'login') && <DialogNote>{hint}</DialogNote>}
        {(error || login.failed) && <DialogNote error>{error || login.failed}</DialogNote>}
        <div className="pb-3">{pages[part]}</div>
      </Dialog>
      {open === 'leave' && <ConfirmDialog title="Throw away your changes?" danger keep="Keep editing"
        confirm="Throw away" onClose={() => setOpen(null)} onConfirm={onClose} />}
      {open === 'code' && <BackLayer onBack={() => setOpen(null)}><AuthenticatorHelp cluster={d}
        onClose={() => setOpen(null)} /></BackLayer>}
      {open === 'forget' && <ConfirmDialog danger title={d.key_page ? `Forget your ${label}?` : copy.forgetTitle(d)}
        keep={copy.keep} confirm={d.key_page ? `Forget ${label}` : copy.forget} onConfirm={forget}
        onClose={() => setOpen(null)}
        text={d.key_page ? "You'll type it next time you connect. Your key stays on this phone."
          : copy.forgetBody(label)} />}
    </QueueWindow.Provider>
  )
}
