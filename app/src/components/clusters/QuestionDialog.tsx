import { ShieldCheck } from 'lucide-react'
import { useState } from 'react'

import type { Cluster, Question } from '../../types/clusters'
import { EButton } from '../e/extra'
import { EDialog, Field, List, MainButton, Row } from '../e/ui'
import { AuthenticatorHelp } from './AuthenticatorHelp'
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
      <EDialog title={q.title ?? q.name} width={440} onClose={cancel} actions={<>
        <EButton onClick={cancel}>Not now</EButton>
        <MainButton className="flex-1" autoFocus onClick={() => onAnswer('yes')}>Set up</MainButton>
      </>}>
        <p className="px-5 pb-2 text-dim">{q.prompt}</p>
      </EDialog>
    )
  }

  if (q.kind === 'code') {
    const typed = (v: string) => {
      setText(v)
      if (/^\d{6}$/.test(digits(v))) onAnswer(digits(v))  // sent as soon as 6 digits are in
    }
    return (
      <>
        <EDialog title={`Code for ${cluster?.name ?? q.name}`} width={440} onClose={cancel} actions={<>
          <EButton onClick={cancel}>Stop signing in</EButton>
          <MainButton className="flex-1" disabled={!digits(text)} onClick={() => onAnswer(digits(text))}>Send
          </MainButton>
        </>}>
          <p className="px-5 pb-3 text-dim">Open your authenticator app and type the 6-digit code.</p>
          <form className="px-5 pb-4" onSubmit={(e) => { e.preventDefault(); if (digits(text)) onAnswer(digits(text)) }}>
            <input autoFocus inputMode="numeric" maxLength={8} placeholder="123456" value={text}
              onChange={(e) => typed(e.target.value)} aria-label="Code"
              className="h-14 w-full rounded-lg border-[1.5px] border-accent bg-window text-center text-3xl font-semibold
                tracking-[0.2em] tabular-nums outline-none placeholder:text-faint" />
          </form>
          {cluster && <List><Row icon={ShieldCheck} label="No code yet? How to set it up" opens
            onPress={() => setHelp(true)} /></List>}
        </EDialog>
        {help && cluster && <AuthenticatorHelp cluster={cluster} onClose={() => setHelp(false)} />}
      </>
    )
  }

  return (
    <EDialog title={`${q.name} is asking`} width={440} onClose={cancel} actions={<>
      <EButton onClick={cancel}>Stop signing in</EButton>
      <MainButton className="flex-1" onClick={() => onAnswer(text)}>Send</MainButton>
    </>}>
      {q.prompt?.trim() && <p className="px-5 pb-1 whitespace-pre-wrap text-dim">{q.prompt.trim()}</p>}
      <form className="px-5 pb-2" onSubmit={(e) => { e.preventDefault(); onAnswer(text) }}>
        <Field label="Answer" type="password" value={text} autoFocus onChange={(e) => setText(e.target.value)} />
      </form>
    </EDialog>
  )
}
