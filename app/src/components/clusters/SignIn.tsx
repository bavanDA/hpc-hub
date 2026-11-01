// Web sign-in, the VPN's or a portal's (prompts.py, browser_login.py, web_login.py): where to sign in, signing
// in in our own Chrome window, and the app's own sign-in window (app/src-tauri/src/sso.rs, opened here). Never
// your own Chrome profile.
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { Check, Globe } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { Question } from '../../types/clusters'
import { Button, Dialog, Spinner } from '../ui'
import { Group } from './fields'

export const inTauri = '__TAURI_INTERNALS__' in window

export const CHROME_WINDOW = { title: 'Chrome window (faster)', sub: 'A separate Chrome profile, signs in instantly' }

export function PickBrowser({ q, onAnswer }: { q: Question; onAnswer: (a: string | null) => void }) {
  const options = [{ value: '', title: 'Built-in window', sub: `Fills in your ${q.label || 'username'} and password` },
    ...(q.chrome_window ? [{ value: q.chrome_window, ...CHROME_WINDOW }] : [])]
  const want = (q.default ?? '').toLowerCase()
  const [picked, setPicked] = useState(options.find((o) => o.value.toLowerCase() === want)?.value ?? '')
  const cancel = () => onAnswer(null)
  return (
    <Dialog title={`Sign in to the ${q.who || q.name} VPN`} onClose={cancel} width={440}
      actions={<><Button onClick={cancel}>Cancel</Button>
        <Button kind="suggested" onClick={() => onAnswer(picked)}>Sign in</Button></>}>
      <Group>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={picked === o.value}
            onClick={() => setPicked(o.value)} onDoubleClick={() => onAnswer(o.value)}
            className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left hover:bg-hover">
            <span className={`grid size-5 shrink-0 place-items-center rounded-full ${
              picked === o.value ? 'bg-accent text-white' : 'border-2 border-line'}`}>
              {picked === o.value && <Check size={14} />}</span>
            <div className="min-w-0 flex-1">
              <div>{o.title}</div>
              {o.sub && <div className="truncate text-sm text-dim">{o.sub}</div>}
            </div>
          </button>
        ))}
      </Group>
    </Dialog>
  )
}

function Waiting({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      <Globe size={40} strokeWidth={1.25} className="text-dim" />
      <h3 className="text-xl font-semibold">{title}</h3>
      <p className="max-w-sm text-dim">{text}</p>
      <Spinner size={24} />
    </div>
  )
}

/** Signing in in our own Chrome window: the backend sees the sign-in at once and closes the window. */
export function ChromeWindowLogin({ q, onAnswer }: { q: Question; onAnswer: (a: string | null) => void }) {
  const cancel = () => onAnswer(null)
  return (
    <Dialog title={q.title ?? `${q.name} VPN sign-in`} onClose={cancel} width={460}
      actions={<Button onClick={cancel}>Cancel</Button>}>
      <Waiting title="Sign in in the Chrome window"
        text="Sign in and approve Duo in the Chrome window that opened. It closes by itself once you are signed in." />
      <div className="mt-4 flex flex-col items-center gap-2">
        <Button kind="ghost" onClick={() => onAnswer('in-app')}>Sign in in the app instead</Button>
      </div>
    </Dialog>
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
    <Dialog title={q.title ?? `${q.name} VPN sign-in`} onClose={cancel} width={460}
      actions={<><Button onClick={cancel}>Cancel</Button>
        {!error && <Button kind="suggested" onClick={() => inTauri && invoke('sso_show', { id: q.id })}>
          Show sign-in window</Button>}</>}>
      {error
        ? <p className="rounded-lg bg-bad-bg px-4 py-2.5 text-center font-semibold text-bad">
            Could not open the sign-in window: {error}</p>
        : <Waiting title="Sign in in the window that opened" text={status} />}
      {!error && <p className="mt-3 text-center text-sm text-dim">
        {q.note ?? (q.fill ? 'HPC Hub fills in your username and password on the first page. On any other page, '
          + 'type them yourself.' : 'No password is saved for this VPN, so you type it there.')}</p>}
    </Dialog>
  )
}
