// One question a login asks (prompts.py): a password, a 6-digit code, or where to sign in to the VPN.
import { Check } from 'lucide-react'
import { useState } from 'react'

import type { Cluster, Question } from '../../types/clusters'
import { Button, Dialog } from '../ui'
import { AuthenticatorHelp } from './AuthenticatorHelp'
import { EntryRow, Group } from './fields'

const digits = (text: string) => text.replace(/\s/g, '')

export function QuestionDialog({ q, cluster, onAnswer }:
  { q: Question; cluster?: Cluster; onAnswer: (answer: string | null) => void }) {
  const [text, setText] = useState('')
  const [help, setHelp] = useState(false)
  const cancel = () => onAnswer(null)

  if (q.kind === 'pick-browser') {
    return (
      <Dialog title={`Sign in to the ${q.name} VPN`} onClose={cancel} width={440}
        actions={<><Button onClick={cancel}>Cancel</Button>
          <Button kind="suggested" onClick={() => onAnswer('')}>Sign in</Button></>}>
        <p className="mb-3 text-center text-dim">Where do you want to sign in?</p>
        <Group>
          <div className="flex min-h-[56px] items-center gap-3 px-4 py-2">
            <span className="grid size-5 place-items-center rounded-full bg-accent text-white">
              <Check size={13} /></span>
            <div className="flex-1">
              <div>HPC Hub window</div>
              <div className="text-[13px] text-dim">Fills in your username and password</div>
            </div>
          </div>
        </Group>
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
          actions={<><Button onClick={cancel}>Cancel</Button>
            <Button kind="suggested" disabled={!digits(text)} onClick={() => onAnswer(digits(text))}>Send</Button></>}>
          <p className="mb-4 text-center text-dim">Open your authenticator app and type the 6-digit code.</p>
          <form onSubmit={(e) => { e.preventDefault(); if (digits(text)) onAnswer(digits(text)) }}>
            <input autoFocus inputMode="numeric" maxLength={8} placeholder="123456" value={text}
              onChange={(e) => typed(e.target.value)} aria-label="Code"
              className="h-14 w-full rounded-xl bg-pill text-center text-3xl font-bold tracking-[0.2em] tabular-nums
                outline-none placeholder:text-dim focus:ring-2 focus:ring-accent" />
          </form>
          {cluster && (
            <button type="button" onClick={() => setHelp(true)}
              className="mx-auto mt-3 block rounded-md px-3 py-1.5 font-bold hover:bg-hover">
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
