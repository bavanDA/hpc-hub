import { useState } from 'react'

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

  async function save() {
    setBusy(true)
    setError('')
    try {
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
      <Footer onSkip={ready || (!keys && login.saved?.ssh.password) ? undefined : skip}>
        <MainButton type="submit" disabled={!ready || busy}>{copy.continue}</MainButton>
      </Footer>
      {portal && <KeySetupDialog cluster={c} onClose={() => setPortal(false)}
        onDone={() => { setPortal(false); onNext() }} />}
    </form>
  )
}
