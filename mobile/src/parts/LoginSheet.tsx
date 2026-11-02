// A cluster's sign-in on the phone: scanned from the desktop app's QR code (scanPairing.ts), or typed here. Kept on
// the phone in the encrypted vault (vault_file.py). The words are the desktop's (loginCopy.ts). A cluster that takes
// only SSH keys (Yale) gets this phone's key instead of a password: make it, copy it to the cluster's key page. A
// VPN with a login of its own (Yale's) has its username and password here too, for its sign-in page.
import { Copy, ExternalLink, KeyRound, ScanQrCode, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'

import { copyText } from '@shared/components/app/clipboard'
import { openSystem } from '@shared/components/app/openLink'
import { copy, fill, keyHelp, who } from '@shared/components/clusters/loginCopy'
import { S } from '@shared/components/clusters/loginStrings'
import { call } from '@shared/rpc'
import type { Cluster, Logins, MyKey } from '@shared/types/clusters'
import { Button, ConfirmSheet, Field, List, MainButton, Row, Section, Sheet, ToggleRow, useToast } from '../ui'
import { AuthenticatorSheet } from './AuthenticatorSheet'
import { scanPairing } from './scanPairing'

/** Signs in with an SSH key and no password: the cluster has a page for your public key. */
export const usesKey = (c: Cluster) => !!c.key_page && !c.password_too && !c.password_only

/** This phone's key for the cluster: make it, copy it, open the page it goes on. */
function KeyRows({ cluster: c }: { cluster: Cluster }) {
  const toast = useToast()
  const [key, setKey] = useState<MyKey | null | undefined>(undefined)
  const [copied, setCopied] = useState(false)
  useEffect(() => { call<MyKey | null>('keys.mine', { cluster: c.id }).then(setKey).catch(() => setKey(null)) }, [c.id])
  const run = (what: () => Promise<void>) => what().catch((e: Error) => toast(e.message))
  const org = who(c)

  return (
    <Section title={fill(S.STEP_ADD, { who: org })} note={<>
      {key && <span className="block">{fill(S.PASTE_IT, { who: org })} {c.key_page_note}</span>}
      <button onClick={() => openSystem(keyHelp(c))} className="-ml-1 min-h-12 px-1 font-semibold text-text underline
        underline-offset-2">{copy.whatsAKey}</button></>}>
      {key === null && <Row icon={KeyRound} label={S.CREATE_KEY}
        onPress={() => run(async () => setKey(await call<MyKey>('keys.create')))} />}
      {key && <>
        <Row icon={KeyRound} label="This phone's key" sub={<span className="break-all font-mono text-xs">
          {key.public}</span>} />
        <Row icon={Copy} label={copied ? S.COPIED : `${S.COPY_KEY} key`} onPress={() => run(async () => {
          await copyText(key.public)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        })} />
        <Row icon={ExternalLink} label={S.OPEN_PAGE} onPress={() => openSystem(c.key_page!).catch(() => {})} />
      </>}
    </Section>
  )
}

export function LoginSheet({ cluster: c, hint, onClose }: { cluster: Cluster; hint?: string; onClose: () => void }) {
  const toast = useToast()
  const [saved, setSaved] = useState<Logins | null>(null)
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [vpnUser, setVpnUser] = useState('')
  const [vpnPassword, setVpnPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [ask, setAsk] = useState<'' | 'forget' | 'code'>('')
  const label = c.username_label || 'Username'
  const key = usesKey(c)
  const ownVpnLogin = c.vpn.enabled && !(c.vpn.same_login_as_ssh ?? true)
  useEffect(() => {
    call<Logins>('clusters.login', { cluster: c.id }).then((l) => {
      setSaved(l)
      setUser(l.ssh.username)
      setVpnUser(l.vpn.username)
      setRemember(l.remember ?? true)
    }).catch((e: Error) => toast(e.message))
  }, [c.id, toast])

  async function save() {
    try {
      await call('clusters.set_login', { cluster: c.id, kind: 'ssh', username: user, password: key ? '' : password,
        remember })
      if (ownVpnLogin && vpnUser.trim()) {
        await call('clusters.set_login', { cluster: c.id, kind: 'vpn', username: vpnUser, password: vpnPassword,
          remember })
      }
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
    <Sheet title={copy.signIn(c)} onClose={onClose} flush
      actions={<MainButton disabled={!user.trim()} onClick={save}>Save</MainButton>}>
      <div className="px-4">
        {hint && <p className="pb-3">{hint}</p>}
        <Button icon={ScanQrCode} className="w-full" onClick={scan}>Scan from your computer</Button>
        <p className="pt-2 text-sm text-dim">On the computer, open HPC Hub's menu, then Set up the phone app.</p>
      </div>
      <h3 className="px-4 pt-6 text-xs font-semibold tracking-wide text-dim uppercase">Or type it</h3>
      {key && <p className="px-4 pt-1">{copy.keyIntro(c)}</p>}
      <form className="px-4 pt-1" onSubmit={(e) => { e.preventDefault(); save() }}>
        <Field label={label} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username"
          placeholder={copy.usernameHint} value={user} onChange={(e) => setUser(e.target.value)} />
        {!key && <Field label={copy.password} type="password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)} placeholder={saved?.ssh.password ? copy.saved : ''} />}
      </form>
      {ownVpnLogin && <>
        <h3 className="px-4 pt-6 text-xs font-semibold tracking-wide text-dim uppercase">VPN login</h3>
        <p className="px-4 pt-1 text-sm text-dim">What you type on the {who(c)} VPN sign-in page.</p>
        <form className="px-4 pt-1" onSubmit={(e) => { e.preventDefault(); save() }}>
          <Field label="VPN username" type="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            placeholder="jane.doe@example.edu" value={vpnUser} onChange={(e) => setVpnUser(e.target.value)} />
          <Field label="VPN password" type="password" value={vpnPassword}
            onChange={(e) => setVpnPassword(e.target.value)} placeholder={saved?.vpn.password ? copy.saved : ''} />
        </form>
      </>}
      {key ? <KeyRows cluster={c} /> : <>
        <p className="px-4 pb-3 text-sm text-dim">Kept encrypted on this phone. Changing it here doesn't change your
          {' '}{who(c)} password.</p>
        <List>
          <ToggleRow label={copy.remember} sub={remember ? undefined : copy.rememberOff} checked={remember}
            onChange={setRemember} />
          {c.second_factor === 'code' && c.code_setup && <Row icon={ShieldCheck} label={copy.codeSetup} opens
            onPress={() => setAsk('code')} />}
          {saved?.ssh.password && <Row label={copy.forget} danger onPress={() => setAsk('forget')} />}
        </List>
      </>}
      {ask === 'forget' && <ConfirmSheet title={copy.forgetTitle(c)} text={copy.forgetBody(label)} confirm={copy.forget}
        keep="Keep it" danger onConfirm={forget} onClose={() => setAsk('')} />}
    </Sheet>
  )
}
