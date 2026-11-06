import type { Cluster } from '../../../types/clusters'
import { Row } from '../../e/Row'
import { Section } from '../../e/Section'
import { keyHeading } from '../keyHeading'
import { copy } from '../loginCopy'
import { LoginFields } from '../LoginFields'
import type { Login } from '../useLogin'

export function LoginPart({ d, login, signedIn, onPortal, onForget }: {
  d: Cluster; login: Login; signedIn: boolean; onPortal: () => void; onForget: () => void
}) {
  const label = d.username_label || 'Username'
  // a key cluster has no password to forget: its username goes
  const forget = (d.key_page ? !!login.saved?.ssh.username : !!login.saved?.ssh.password) && (
    <Section><Row label={d.key_page ? `Forget ${label}` : copy.forget} danger onPress={onForget} /></Section>)
  return <>
    {!!d.key_page && !login.usePassword && <p className="px-5 pb-1 text-dim">{keyHeading(d).text}</p>}
    <LoginFields cluster={d} login={login} onPortal={onPortal} signedIn={signedIn}>{forget}</LoginFields>
  </>
}
