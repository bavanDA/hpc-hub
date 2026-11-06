import { useEffect, useRef, useState } from 'react'

import { call } from '../../rpc'
import type { LockSetup } from '../../types/permissions'
import { EDialog, Field, MainButton } from '../e/ui'
import { Spinner } from '../ui'

/** The secret stays in the backend until it is on the cluster; this only shows it to scan. */
export function LockSetupDialog({ cluster, name, onClose, onDone }:
  { cluster: string; name: string; onClose: () => void; onDone: (message: string) => void }) {
  const [setup, setSetup] = useState<LockSetup | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const id = useRef('')

  useEffect(() => {
    let live = true
    const drop = (sid: string) => call('permissions.lock_cancel', { id: sid }).catch(() => {})
    call<LockSetup>('permissions.lock_start', { cluster }).then((s) => {
      if (!live) { drop(s.id); return }
      id.current = s.id
      setSetup(s)
    }).catch((e: Error) => setError(e.message))
    return () => {
      live = false
      if (id.current) drop(id.current)  // closed without turning it on: forget the secret
    }
  }, [cluster])

  const turnOn = () => {
    if (!setup || busy || !code.trim()) return
    setBusy(true)
    setError('')
    call('permissions.lock_finish', { id: setup.id, code })
      .then(() => {
        id.current = ''
        onDone(`Passcode lock is on for ${name}. New Claude sessions need a code`)
      })
      .catch((e: Error) => { setError(e.message); setBusy(false) })
  }

  return (
    <EDialog title={`Passcode lock on ${name}`} width={420} onClose={onClose}
      actions={setup && <MainButton disabled={busy || !code.trim()} onClick={turnOn}>
        {busy && <Spinner size={16} />}Turn on</MainButton>}>
      {!setup ? (
        <div className="grid h-48 place-items-center">{error ? <p className="text-bad">{error}</p> : <Spinner />}</div>
      ) : (
        <div className="flex flex-col items-center gap-4 px-5 text-center">
          <p>Scan this with Google Authenticator or another authenticator app.</p>
          {setup.qr && <img src={setup.qr} alt="QR code"
            className="size-48 rounded-lg border border-line bg-white p-1 [image-rendering:pixelated]" />}
          <div className="text-sm text-dim">Or type this key in the app:
            <div className="mt-1 font-mono text-md tracking-wide text-text select-text">{setup.key}</div></div>
          <form className="w-full text-left" onSubmit={(e) => { e.preventDefault(); turnOn() }}>
            <Field label="Code from the app" inputMode="numeric" maxLength={7} value={code} autoFocus
              onChange={(e) => setCode(e.target.value)} />
          </form>
          {error && <p className="text-sm text-bad">{error}</p>}
        </div>
      )}
    </EDialog>
  )
}
