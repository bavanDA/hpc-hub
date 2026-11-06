import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useEffect, useRef, useState } from 'react'

import type { Question } from '../../types/clusters'
import { inTauri } from '../app/platform'
import { EButton } from '../e/EButton'
import { EDialog } from '../e/EDialog'
import { MainButton } from '../e/MainButton'
import { SignInWaiting } from './SignInWaiting'

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
        : <SignInWaiting title="Sign in in the window that opened" text={status} />}
      {!error && q.note && <p className="mt-3 px-5 text-center text-sm text-dim">{q.note}</p>}
    </EDialog>
  )
}
