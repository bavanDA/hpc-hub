// Globus sign-in on the phone: open the Globus page in the browser, sign in and Allow, copy the code it shows,
// come back and paste it. Coming back with a code copied fills it in.
import { ClipboardPaste, ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'

import { openSystem } from '@shared/components/app/openLink'
import { looksLikeCode, pastedCode } from '@shared/components/globus/parts'
import { Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { GlobusStatus, Login } from '@shared/types/globus'
import { Button, Field, Sheet } from '../../ui'

const read = () => navigator.clipboard.readText().catch(() => '')

function steps(login: Login): [string, string][] {
  const second: [string, string] = login.domain
    ? [`Sign in with your ${login.domain} account, then tap Allow`,
      `${login.what || 'This cluster'} only lets in ${login.domain} accounts.`]
    : login.fresh ? ['Sign in and tap Allow', 'Pick your university or ACCESS CI, whichever your clusters use.']
      : ['Tap Allow', `Lets HPC Hub reach ${login.what || 'your clusters'} through Globus. Globus remembers it.`]
  return [['Open the Globus page', 'It opens in your browser.'], second,
    ['Copy the code Globus shows', 'Come back here and it fills in, or tap Paste.']]
}

/** start: globus.login_url (a fresh sign-in) or globus.consent_url (what the collections want). */
export function SignInSheet({ start, onClose, onDone }:
  { start: 'globus.login_url' | 'globus.consent_url'; onClose: () => void; onDone: (s: GlobusStatus) => void }) {
  const [login, setLogin] = useState<Login | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { call<Login>(start).then(setLogin).catch((e: Error) => setError(e.message)) }, [start])

  // back from the browser with the code copied: fill it in
  useEffect(() => {
    const back = () => {
      if (document.visibilityState !== 'visible' || code) return
      read().then((t) => looksLikeCode(t) && setCode(t.trim()))
    }
    document.addEventListener('visibilitychange', back)
    return () => document.removeEventListener('visibilitychange', back)
  }, [code])

  const clean = pastedCode(code)
  const finish = () => {
    if (!login || !clean || busy) return
    setBusy(true)
    setError('')
    call<GlobusStatus>('globus.finish_login', { login_id: login.id, code })
      .then(onDone).catch((e: Error) => { setError(e.message); setBusy(false) })
  }
  const fresh = !login || login.fresh || !!login.domain

  return (
    <Sheet title={fresh ? 'Sign in to Globus' : 'Allow Globus'} onClose={onClose} actions={<>
      <Button className="flex-1" onClick={onClose}>Cancel</Button>
      <Button kind="primary" className="flex-1" disabled={!clean || busy} onClick={finish}>
        {busy && <Spinner size={16} />}{fresh ? 'Sign in' : 'Done'}</Button></>}>
      {!login ? (
        <div className="grid h-40 place-items-center">{error ? <p className="text-bad">{error}</p> : <Spinner size={28} />}</div>
      ) : (
        <div className="flex flex-col gap-4">
          <ol className="flex flex-col gap-3">
            {steps(login).map(([title, text], i) => (
              <li key={title} className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent/15 font-bold
                  text-accent-text">{i + 1}</span>
                <span className="min-w-0"><span className="block font-semibold">{title}</span>
                  <span className="block text-sm text-dim">{text}</span></span>
              </li>
            ))}
          </ol>
          <Button kind="primary" icon={ExternalLink} onClick={() => openSystem(login.url)}>Open the Globus page</Button>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Field label="Code from Globus" value={code} placeholder="Paste the code"
                autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(e) => setCode(e.target.value)} />
            </div>
            <Button icon={ClipboardPaste} className="mb-2" onClick={() => read().then((t) => t && setCode(t.trim()))}>
              Paste</Button>
          </div>
          {error && <p className="text-sm text-bad">{error}</p>}
        </div>
      )}
    </Sheet>
  )
}
