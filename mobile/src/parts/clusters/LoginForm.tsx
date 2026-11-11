// The sign-in form on the phone: Scan from your computer on top (the desktop's Set up the phone app, see
// scanPairing.ts), then the desktop's fields in the phone's words: a username and password, or a cluster's three SSH
// key steps. Used by the Sign-in window and the first start.
import { ScanQrCode, ShieldCheck } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { AuthenticatorHelp } from '@shared/components/clusters/AuthenticatorHelp'
import { KeyHelpLink } from '@shared/components/clusters/KeyHelpLink'
import { copy } from '@shared/components/clusters/loginCopy'
import { PasswordInstead } from '@shared/components/clusters/PasswordInstead'
import type { Login } from '@shared/components/clusters/useLogin'
import { Spinner } from '@shared/components/ui/Spinner'
import { secondStep, type Cluster } from '@shared/types/clusters'
import { BackLayer, Button, Field, Row, Section, ToggleRow, useToast } from '../../ui'
import { scanPairing } from '../scanPairing'
import { KeySteps } from './KeySteps'

/** Scan the desktop's code; onScanned hears the cluster names it signed in. */
export function useScan(onScanned: (names: string[]) => void) {
  const toast = useToast()
  return async () => {
    const { msg, names } = await scanPairing()
    if (msg) toast(msg)
    if (names.length) onScanned(names)
  }
}

export function LoginForm({ cluster: c, login, onScanned, signedIn, onTested, children }: {
  cluster: Cluster; login: Login; onScanned: (names: string[]) => void; signedIn?: boolean
  onTested?: (ok: boolean) => void; children?: ReactNode
}) {
  const scan = useScan(onScanned)
  const [help, setHelp] = useState(false)
  const keys = !!c.key_page && !login.usePassword
  const instead = c.key_page && c.password_too
    ? <div className="px-5 pt-4"><PasswordInstead on={login.usePassword} onChange={login.setUsePassword} /></div> : null
  return <>
    <div className="px-5">
      <Button icon={ScanQrCode} className="w-full" onClick={scan}>Scan from your computer</Button>
      <p className="pt-2 text-sm text-dim">On the computer, open HPC Hub's menu, then Set up the phone app.</p>
    </div>
    <h3 className="px-5 pt-5 pb-1.5 text-xs font-semibold tracking-wide text-dim uppercase">Or type it</h3>
    {keys ? <>
      <p className="px-5 pb-1 text-dim">{copy.keyIntro(c)} <KeyHelpLink cluster={c} /></p>
      <div className="px-5">
        {login.loaded ? <KeySteps cluster={c} user={login.user} onUser={login.setUser} signedIn={signedIn}
          onTested={onTested} /> : <div className="grid h-40 place-items-center"><Spinner size={24} /></div>}
      </div>
    </> : <>
      <div className="px-5">
        <Field label={c.username_label || 'Username'} value={login.user} placeholder={copy.usernameHint}
          autoCapitalize="none" autoCorrect="off" autoComplete="username"
          onChange={(e) => login.setUser(e.target.value)} />
        <Field label={copy.password} type="password" value={login.password} autoComplete="current-password"
          onChange={(e) => login.setPassword(e.target.value)}
          placeholder={!login.remember ? 'Asked when you connect' : login.saved?.ssh.password ? copy.saved : undefined} />
      </div>
      <Section note={login.remember ? 'Kept on this phone.' : undefined}>
        <ToggleRow label={copy.remember} sub={login.remember ? undefined : copy.rememberOff} checked={login.remember}
          onChange={login.setRemember} />
      </Section>
      {secondStep(c) && (c.code_setup ? <Section note={secondStep(c)}>
        <Row icon={ShieldCheck} label={copy.codeSetup} opens onPress={() => setHelp(true)} />
      </Section> : <p className="px-5 pt-3 text-sm text-dim">{secondStep(c)}</p>)}
    </>}
    {instead}
    {children}
    {help && <BackLayer onBack={() => setHelp(false)}><AuthenticatorHelp cluster={c}
      onClose={() => setHelp(false)} /></BackLayer>}
  </>
}
