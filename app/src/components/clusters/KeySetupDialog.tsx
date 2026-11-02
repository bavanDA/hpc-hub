// Log in through the cluster's web portal (key_setup.py): you sign in in a window HPC Hub opens (the "web-login"
// or "chrome-window" question, shown by Questions.tsx), then the backend adds this computer's SSH key through the
// portal and saves your username (methods/keysetup.py). Your own browser is never touched.
import { CircleCheck, CircleX, Globe } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { call } from '../../rpc'
import type { Cluster, KeySetup } from '../../types/clusters'
import { Button } from '../e/parts'
import { EDialog } from '../e/ui'
import { Spinner } from '../ui'
import { shortName } from './loginCopy'

/** onDone(username) once the key is on the cluster (then connect). */
export function KeySetupDialog({ cluster: c, onClose, onDone }:
  { cluster: Cluster; onClose: () => void; onDone: (user: string) => void }) {
  const [s, setS] = useState<KeySetup | null>(null)
  const finished = useRef(false)
  const done = useRef(onDone)
  useEffect(() => { done.current = onDone })

  useEffect(() => {
    let live = true
    const look = () => call<KeySetup>('keysetup.status', { cluster: c.id }).then((got) => {
      if (!live) return
      setS(got)
      if (got.state === 'done' && !finished.current) {
        finished.current = true
        setTimeout(() => done.current(got.user), 1200)  // long enough to read "Key added"
      }
    }).catch(() => {})
    call<KeySetup>('keysetup.start', { cluster: c.id }).then((got) => live && setS(got))
      .catch((e: Error) => live && setS({ state: 'failed', title: 'Could not start', text: e.message, user: '' }))
    const timer = setInterval(look, 1000)
    return () => {
      live = false
      clearInterval(timer)
      if (!finished.current) call('keysetup.stop', { cluster: c.id }).catch(() => {})
    }
  }, [c.id])

  // while you sign in, the sign-in window's own dialog is the one on screen
  if (!s || s.state === 'waiting') return null
  const busy = s.state === 'working'
  const Icon = s.state === 'done' ? CircleCheck : s.state === 'failed' ? CircleX : Globe
  return (
    <EDialog title={`Sign in to ${c.name}`} onClose={onClose} width={480}
      actions={<Button className="flex-1" onClick={onClose}>{s.state === 'done' ? 'Close' : 'Stop signing in'}</Button>}>
      <div className="flex flex-col items-center gap-3 px-5 py-2 text-center">
        <Icon size={40} strokeWidth={1.25} className={s.state === 'failed' ? 'text-bad' : s.state === 'done' ? ''
          : 'text-dim'} />
        <h3 className="text-lg font-semibold">{s.title || 'Sign in to the portal'}</h3>
        <p className="max-w-sm text-dim">{s.text}</p>
        {busy && <Spinner size={24} />}
      </div>
      <p className="mt-3 px-5 text-center text-sm text-dim">
        No password is saved{c.second_factor === 'code'
          ? `. ${shortName(c)} still asks for the code from your authenticator app when you connect.` : '.'}</p>
    </EDialog>
  )
}
