import { Globe, ShieldCheck } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { secondStep, type Cluster } from '../../types/clusters'
import { Field, Row, Section, ToggleRow } from '../e/ui'
import { Spinner } from '../ui'
import { AuthenticatorHelp } from './AuthenticatorHelp'
import { KeyPanel } from './KeyPanel'
import { PasswordInstead } from './PasswordInstead'
import { copy } from './loginCopy'
import type { Login } from './useLogin'

/** onPortal: set the login up through the cluster's web portal instead (the caller opens KeySetupDialog).
 *  signedIn and onTested go to KeyPanel. children: more rows under the form (Settings' Forget). */
export function LoginFields({ cluster: c, login, onPortal, signedIn, onTested, children }: {
  cluster: Cluster; login: Login; onPortal?: () => void; signedIn?: boolean; onTested?: (ok: boolean) => void
  children?: ReactNode
}) {
  const [help, setHelp] = useState(false)
  const instead = c.key_page && c.password_too
    ? <div className="px-5 pt-4"><PasswordInstead on={login.usePassword} onChange={login.setUsePassword} /></div>
    : null
  if (c.key_page && !login.usePassword) {
    return <>
      <div className="px-5">
        {login.loaded ? <KeyPanel cluster={c} user={login.user} onUser={login.setUser} signedIn={signedIn}
          onTested={onTested} /> : <div className="grid h-40 place-items-center"><Spinner size={24} /></div>}
      </div>
      {instead}
      {children}
    </>
  }
  return <>
    <div className="px-5">
      <Field label={c.username_label || 'Username'} value={login.user} autoFocus placeholder={copy.usernameHint}
        onChange={(e) => login.setUser(e.target.value)} />
      <Field label={copy.password} type="password" value={login.password}
        onChange={(e) => login.setPassword(e.target.value)}
        placeholder={!login.remember ? 'Asked when you connect' : login.saved?.ssh.password ? copy.saved : undefined} />
    </div>
    <Section note={login.remember ? copy.passwordNote(c) : undefined}>
      <ToggleRow label={copy.remember} sub={login.remember ? undefined : copy.rememberOff} checked={login.remember}
        onChange={login.setRemember} />
    </Section>
    {secondStep(c) && (c.code_setup ? <Section note={secondStep(c)}>
      <Row icon={ShieldCheck} label={copy.codeSetup} opens onPress={() => setHelp(true)} />
    </Section> : <p className="px-5 pt-3 text-sm text-dim">{secondStep(c)}</p>)}
    {c.portal && onPortal && <Section note={copy.portalNote}>
      <Row icon={Globe} label={copy.portal(c)} opens onPress={onPortal} />
    </Section>}
    {instead}
    {children}
    {help && <AuthenticatorHelp cluster={c} onClose={() => setHelp(false)} />}
  </>
}
