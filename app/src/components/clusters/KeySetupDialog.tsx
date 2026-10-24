// Log in through the cluster's web portal in Chrome (key_setup.py): once you are signed in there, the backend
// adds this computer's SSH key through the portal and saves your username (methods/keysetup.py).
import { CircleCheck, CircleX, Globe } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { call } from '../../rpc'
import type { Cluster, KeySetup } from '../../types/clusters'
import { useToast } from '../toast'
import { Button, Dialog, Spinner } from '../ui'

function host(url: string) {
  try { return new URL(url).hostname } catch { return url }
}

/** onDone(username) once the key is on the cluster (then connect). */
export function KeySetupDialog({ cluster: c, onClose, onDone }:
  { cluster: Cluster; onClose: () => void; onDone: (user: string) => void }) {
  const toast = useToast()
  const [s, setS] = useState<KeySetup | null>(null)
  const [profiles, setProfiles] = useState<string[]>([])
  const [profile, setProfile] = useState('')
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
    call<string[]>('keysetup.profiles').then((p) => live && setProfiles(p)).catch(() => {})
    const timer = setInterval(look, 1000)
    return () => {
      live = false
      clearInterval(timer)
      if (!finished.current) call('keysetup.stop', { cluster: c.id }).catch(() => {})
    }
  }, [c.id])

  const again = () => call('keysetup.open', { cluster: c.id, profile }).catch((e: Error) => toast(e.message))
  const busy = !s || s.state === 'waiting' || s.state === 'working'
  const Icon = s?.state === 'done' ? CircleCheck : s?.state === 'failed' ? CircleX : Globe
  const site = host(c.portal ?? '')
  return (
    <Dialog title={`Log in to ${c.name}`} onClose={onClose} width={480}
      actions={<Button onClick={onClose}>{s?.state === 'done' ? 'Close' : 'Cancel'}</Button>}>
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <Icon size={48} strokeWidth={1.25}
          className={s?.state === 'done' ? 'text-ok' : s?.state === 'failed' ? 'text-bad' : 'text-dim'} />
        <h3 className="text-xl font-bold">{s?.title || 'Sign in to the portal in Chrome'}</h3>
        <p className="max-w-sm text-dim">{s?.text}</p>
        {busy && <Spinner size={28} />}
      </div>
      {s?.state === 'waiting' && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <Button round onClick={again}>Open {site || 'the portal'} again</Button>
          {profiles.length > 0 && (
            <select value={profile} onChange={(e) => setProfile(e.target.value)} aria-label="Open in"
              className="h-[42px] rounded-full bg-pill px-4 outline-none focus:ring-2 focus:ring-accent">
              <option value="">in your usual browser</option>
              {profiles.map((p) => <option key={p} value={p}>in Chrome: {p}</option>)}
            </select>
          )}
        </div>
      )}
      <p className="mt-4 text-center text-[13px] text-dim">
        No password is saved{c.second_factor === 'code'
          ? `. ${c.name} still asks for the code from your authenticator app when you connect.` : '.'}</p>
    </Dialog>
  )
}
