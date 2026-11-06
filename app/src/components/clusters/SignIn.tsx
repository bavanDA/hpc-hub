import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { Globe } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { Question } from '../../types/clusters'
import { EButton } from '../e/extra'
import { EDialog, MainButton } from '../e/ui'
import { Spinner } from '../ui'

export const inTauri = '__TAURI_INTERNALS__' in window

export const CHROME_WINDOW = { title: 'Chrome window', sub: 'Its own Chrome profile, kept apart from yours' }

function Waiting({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-2 text-center">
      <Globe size={40} strokeWidth={1.25} className="text-dim" />
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="max-w-sm text-dim">{text}</p>
      <Spinner size={24} />
    </div>
  )
}

/** Signing in in our own Chrome window: the backend sees the sign-in at once and closes the window. */
export function ChromeWindowLogin({ q, onAnswer }: { q: Question; onAnswer: (a: string | null) => void }) {
  const cancel = () => onAnswer(null)
  return (
    <EDialog title={q.title ?? `${q.name} VPN sign-in`} onClose={cancel} width={460} actions={<>
      <EButton onClick={cancel}>Stop signing in</EButton>
      <EButton className="flex-1" onClick={() => onAnswer('in-app')}>Sign in in the app instead</EButton>
    </>}>
      <Waiting title="Sign in in the Chrome window"
        text="Sign in and approve Duo in the Chrome window that opened. It closes by itself once you are signed in." />
    </EDialog>
  )
}

/** The app's sign-in window: opened in Tauri, answered by Questions.tsx when it reports back. */
export function WebLogin({ q, onAnswer }: { q: Question; onAnswer: (a: string | null) => void }) {
  const [status, setStatus] = useState('Signing in. Approve Duo on your phone when it asks.')
  const [error, setError] = useState('')
  const opened = useRef(false)

  useEffect(() => {
    if (!inTauri || opened.current) return
    opened.current = true
    const req = { id: q.id, title: q.title ?? `${q.name} VPN sign-in`, login_url: q.login_url, final_url: q.final_url,
      token_cookie: q.token_cookie, error_cookie: q.error_cookie, fill: q.fill ?? null }
    invoke('sso_open', { req }).catch((e) => setError(String(e)))
  }, [q])

  useEffect(() => {
    if (!inTauri) return
    const stop = listen<{ id: string; text: string }>('sso-status', (e) => {
      if (e.payload.id === q.id) setStatus(e.payload.text)
    })
    return () => { stop.then((fn) => fn()) }
  }, [q.id])

  const cancel = () => {
    if (inTauri) invoke('sso_close', { id: q.id }).catch(() => {})
    onAnswer(null)
  }
  return (
    <EDialog title={q.title ?? `${q.name} VPN sign-in`} onClose={cancel} width={460} actions={<>
      <EButton className={error ? 'flex-1' : ''} onClick={cancel}>Stop signing in</EButton>
      {!error && <MainButton className="flex-1" onClick={() => inTauri && invoke('sso_show', { id: q.id })}>
        Show sign-in window</MainButton>}
    </>}>
      {error
        ? <p role="alert" className="px-5 pb-2 font-semibold text-bad">Couldn't open the sign-in window: {error}</p>
        : <Waiting title="Sign in in the window that opened" text={status} />}
      {!error && q.note && <p className="mt-3 px-5 text-center text-sm text-dim">{q.note}</p>}
    </EDialog>
  )
}
