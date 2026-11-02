// One question a login asks (prompts.py): a password, a 6-digit code, or the VPN's web sign-in (SignIn.tsx).
import { useState } from 'react'

import type { Cluster, Question } from '../../types/clusters'
import { Button, Dialog } from '../ui'
import { AuthenticatorHelp } from './AuthenticatorHelp'
import { EntryRow, Group } from './fields'
import { ChromeWindowLogin, WebLogin } from './SignIn'

const digits = (text: string) => text.replace(/\s/g, '')

export function QuestionDialog({ q, cluster, onAnswer }:
  { q: Question; cluster?: Cluster; onAnswer: (answer: string | null) => void }) {
  const [text, setText] = useState('')
  const [help, setHelp] = useState(false)
  const cancel = () => onAnswer(null)

  if (q.kind === 'chrome-window') return <ChromeWindowLogin q={q} onAnswer={onAnswer} />
  if (q.kind === 'web-login') return <WebLogin q={q} onAnswer={onAnswer} />
  if (q.kind === 'confirm') {
    return (
      <Dialog title={q.title ?? q.name} onClose={cancel} width={440}
        actions={<><Button onClick={cancel}>Not now</Button>
          <Button kind="suggested" autoFocus onClick={() => onAnswer('yes')}>Set up</Button></>}>
        <p className="text-dim">{q.prompt}</p>
      </Dialog>
    )
  }

  if (q.kind === 'code') {
    const typed = (v: string) => {
      setText(v)
      if (/^\d{6}$/.test(digits(v))) onAnswer(digits(v))  // sent as soon as 6 digits are in
    }
    return (
      <>
        <Dialog title={`Code for ${q.name}`} onClose={cancel} width={420}
          actions={<><Button onClick={cancel}>Stop signing in</Button>
            <Button kind="suggested" disabled={!digits(text)} onClick={() => onAnswer(digits(text))}>Send</Button></>}>
          <p className="mb-4 text-center text-dim">Open your authenticator app and type the 6-digit code.</p>
          <form onSubmit={(e) => { e.preventDefault(); if (digits(text)) onAnswer(digits(text)) }}>
            <input autoFocus inputMode="numeric" maxLength={8} placeholder="123456" value={text}
              onChange={(e) => typed(e.target.value)} aria-label="Code"
              className="h-14 w-full rounded-xl bg-pill text-center text-3xl font-bold tracking-[0.2em] tabular-nums
                outline-none placeholder:text-dim focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus" />
          </form>
          {cluster && (
            <button type="button" onClick={() => setHelp(true)}
              className="mx-auto mt-3 block rounded-md px-3 py-1.5 font-semibold hover:bg-hover">
              No code yet? How to set it up</button>
          )}
        </Dialog>
        {help && cluster && <AuthenticatorHelp cluster={cluster} onClose={() => setHelp(false)} />}
      </>
    )
  }

  return (
    <Dialog title={`${q.name} is asking`} onClose={cancel} width={440}
      actions={<><Button onClick={cancel}>Cancel</Button>
        <Button kind="suggested" onClick={() => onAnswer(text)}>Send</Button></>}>
      {q.prompt?.trim() && <p className="mb-4 whitespace-pre-wrap text-center text-dim">{q.prompt.trim()}</p>}
      <form onSubmit={(e) => { e.preventDefault(); onAnswer(text) }}>
        <Group><EntryRow label="Answer" value={text} onChange={setText} password autoFocus /></Group>
      </form>
    </Dialog>
  )
}
