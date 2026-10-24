// Globus sign-in: open the Globus page in a browser, sign in and Allow, paste back the code Globus shows.
import { Copy, ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { GlobusStatus, Login } from '../../types/globus'
import { Button, Dialog, List, Spinner } from '../ui'
import { Field, looksLikeCode, pastedCode } from './parts'

function Step({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <span className="w-5 shrink-0 text-center text-xl font-bold text-accent-text">{n}</span>
      <div className="min-w-0">
        <div>{title}</div>
        <div className="text-[13px] text-dim">{text}</div>
      </div>
    </div>
  )
}

function second(login: Login): [string, string] {
  if (login.domain) return [`Sign in with your ${login.domain} account, then click Allow`,
    `${login.what || 'This cluster'} only lets in ${login.domain} accounts. Globus links it to your account`]
  if (login.fresh) return ['Sign in and click Allow', 'Pick your university or ACCESS CI, whichever your clusters use']
  return ['Click Allow', `Lets HPC Hub reach ${login.what || 'your clusters'} through Globus. One time for all of ` +
    'them; Globus remembers it']
}

/** start: globus.login_url (a fresh sign-in) or globus.consent_url (what the collections want). */
export function LoginDialog({ start, onClose, onDone }:
  { start: 'globus.login_url' | 'globus.consent_url'; onClose: () => void; onDone: (s: GlobusStatus) => void }) {
  const [login, setLogin] = useState<Login | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    call<Login>(start).then(setLogin).catch((e: Error) => setError(e.message))
  }, [start])

  // Coming back from the browser with the code copied: fill it in
  useEffect(() => {
    const back = () => {
      if (code) return
      navigator.clipboard?.readText().then((t) => looksLikeCode(t) && setCode(t.trim())).catch(() => {})
    }
    window.addEventListener('focus', back)
    return () => window.removeEventListener('focus', back)
  }, [code])

  const clean = pastedCode(code)
  const finish = () => {
    if (!login || !clean || busy) return
    setBusy(true)
    setError('')
    call<GlobusStatus>('globus.finish_login', { login_id: login.id, code })
      .then(onDone)
      .catch((e: Error) => { setError(e.message); setBusy(false) })
  }
  const copy = () => login && navigator.clipboard?.writeText(login.url).then(() => {
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  })

  const fresh = !login || login.fresh || !!login.domain
  return (
    <Dialog title={fresh ? 'Sign in to Globus' : 'Allow Globus access'} onClose={onClose} width={520}
      actions={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button kind="suggested" disabled={!clean || busy} onClick={finish}>
          {busy && <Spinner size={14} />}{fresh ? 'Sign in' : 'Done'}</Button>
      </>}>
      {!login ? (
        <div className="grid h-40 place-items-center">{error ? <p className="text-bad">{error}</p> : <Spinner />}</div>
      ) : (
        <div className="flex flex-col gap-4 pt-1">
          <List>
            <Step n={1} title="Open the Globus page" text="With the button below, or copy the link into your browser" />
            <Step n={2} title={second(login)[0]} text={second(login)[1]} />
            <Step n={3} title="Copy the code Globus shows" text="It fills in below when you come back here. Or paste it" />
          </List>
          <div className="flex items-center gap-2">
            <div title={login.url}
              className="h-9 min-w-0 flex-1 truncate rounded-md bg-pill px-3 font-mono text-[13px] leading-9 text-dim">
              {login.url}</div>
            <Button onClick={copy}><Copy size={15} />{copied ? 'Copied' : 'Copy'}</Button>
            <Button kind="suggested" onClick={() => window.open(login.url, '_blank')}>
              <ExternalLink size={15} />Open</Button>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-dim">Code from Globus</span>
            <Field autoFocus value={code} placeholder="Paste the code, or the whole page address"
              onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && finish()} />
          </label>
          {error && <p className="text-[13px] text-bad">{error}</p>}
        </div>
      )}
    </Dialog>
  )
}
