import { useState } from 'react'

import { call } from '../../../rpc'
import type { Cluster } from '../../../types/clusters'
import { keyHeading } from '../../clusters/keyHeading'
import { KeySetupDialog } from '../../clusters/KeySetupDialog'
import { copy } from '../../clusters/loginCopy'
import { LoginFields } from '../../clusters/LoginFields'
import { useLogin } from '../../clusters/useLogin'
import { MainButton } from '../../e/MainButton'
import { Footer } from './Footer'
import { Heading } from './Heading'

export function LoginStep({ cluster: c, onNext }: { cluster: Cluster; onNext: () => void }) {
  const login = useLogin(c.id)
  const [portal, setPortal] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [works, setWorks] = useState(false)  // the key's login test passed: Continue is the main button
  // The password couldn't be checked (the cluster is out of reach, e.g. behind its VPN): why, and for which login.
  // The step stays until you choose to go on without the check; typing another login checks again.
  const [unchecked, setUnchecked] = useState<{ text: string; login: string } | null>(null)
  const typedLogin = `${login.user}\n${login.password}`
  const waiting = unchecked?.login === typedLogin ? unchecked.text : ''

  async function save() {
    setBusy(true)
    setError('')
    try {
      // a password login is checked before going on, so a typo shows here, not at the first connect (no Duo push)
      if (!keys && (login.password || login.saved?.ssh.password) && !waiting) {
        const got = await call<{ ok: boolean | null; text: string }>('clusters.check_login',
          { cluster: c.id, username: login.user, password: login.password })
        if (got.ok === false) {
          setError(got.text)
          setBusy(false)
          return
        }
        if (got.ok === null) {
          setUnchecked({ text: got.text, login: typedLogin })
          setBusy(false)
          return
        }
      }
      await login.save()
      onNext()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const keys = !!c.key_page && !login.usePassword
  const typed = !!login.user.trim()
  const ready = keys ? works : typed
  const head = keys ? keyHeading(c) : { title: copy.signIn(c), text: undefined }
  // Skip keeps a username you typed: the key is on disk either way
  const skip = keys ? (typed ? save : onNext) : onNext
  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); if (ready) save() }}>
      <Heading title={head.title} text={head.text} />
      <div>
        <LoginFields cluster={c} login={login} onTested={setWorks} onPortal={() => setPortal(true)} />
      </div>
      {error && <p role="alert" className="px-5 font-semibold text-bad">{error}</p>}
      {waiting && !error && <p role="status" className="px-5 text-dim">{waiting}</p>}
      <Footer onSkip={ready || (!keys && login.saved?.ssh.password) ? undefined : skip}>
        <MainButton type="submit" disabled={!ready || busy}>{busy ? 'Checking…' : waiting ? 'Continue without checking' : copy.continue}</MainButton>
      </Footer>
      {portal && <KeySetupDialog cluster={c} onClose={() => setPortal(false)}
        onDone={() => { setPortal(false); onNext() }} />}
    </form>
  )
}
