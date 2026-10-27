// What a login asks while it runs (hpc_hub/api/hub.py): a password, a 6-digit code, a yes or no; and the Duo
// screen while it waits for your phone. The backend waits on a worker thread until question.answer arrives.
import { Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'

import { load, useClusters } from '@shared/components/clusters/store'
import { useEvent } from '@shared/hooks'
import { call } from '@shared/rpc'
import { DUO, type Question, type Session } from '@shared/types/clusters'
import { Button, Field, Sheet, useToast } from '../ui'

const digits = (text: string) => text.replace(/\s/g, '')
// the VPN's sign-in pages need the in-app VPN, which the phone doesn't have yet
const UNSUPPORTED: Question['kind'][] = ['pick-browser', 'browser-login', 'web-login']

export function Questions() {
  const toast = useToast()
  const { clusters, sessions } = useClusters()
  const [questions, setQuestions] = useState<Question[]>([])
  const [text, setText] = useState('')
  useEffect(load, [])

  function answer(q: Question, value: string | null) {
    setQuestions((all) => all.filter((x) => x.id !== q.id))
    setText('')
    call('question.answer', { id: q.id, answer: value }).catch((e: Error) => toast(e.message))
  }

  useEvent<Question>('question', (q) => {
    if (UNSUPPORTED.includes(q.kind)) {
      toast('The VPN sign-in is not in the phone app yet')
      call('question.answer', { id: q.id, answer: null }).catch(() => {})
      return
    }
    setQuestions((all) => [...all.filter((x) => x.id !== q.id), q])
  })
  useEvent<{ id: string }>('question-done', ({ id }) => setQuestions((all) => all.filter((x) => x.id !== id)))
  useEvent<Session>('session', (s) => {
    if (s.state === 'Error' && s.detail) toast(`${clusters?.find((c) => c.id === s.id)?.name ?? s.id}: ${s.detail}`)
  })

  const duo = Object.values(sessions).find((s) => s.state === DUO)
  const q = questions[0]
  if (q) {
    const cancel = () => answer(q, null)
    if (q.kind === 'confirm') {
      return (
        <Sheet title={q.title ?? q.name} onClose={cancel} actions={<>
          <Button className="flex-1" onClick={cancel}>Not now</Button>
          <Button kind="primary" className="flex-1" onClick={() => answer(q, 'yes')}>Yes</Button></>}>
          <p className="text-dim">{q.prompt}</p>
        </Sheet>
      )
    }
    const code = q.kind === 'code'
    const send = () => answer(q, code ? digits(text) : text)
    return (
      <Sheet title={code ? `Code for ${q.name}` : `${q.name} is asking`} onClose={cancel} actions={<>
        <Button className="flex-1" onClick={cancel}>Cancel</Button>
        <Button kind="primary" className="flex-1" disabled={code && !digits(text)} onClick={send}>Send</Button></>}>
        <form onSubmit={(e) => { e.preventDefault(); send() }}>
          {code
            ? <p className="mb-4 text-center text-dim">Open your authenticator app and type the 6-digit code.</p>
            : q.prompt?.trim() && <p className="mb-4 whitespace-pre-wrap text-dim">{q.prompt.trim()}</p>}
          {code
            ? <input autoFocus inputMode="numeric" maxLength={8} placeholder="123456" value={text} aria-label="Code"
                onChange={(e) => {
                  setText(e.target.value)
                  if (/^\d{6}$/.test(digits(e.target.value))) answer(q, digits(e.target.value))
                }}
                className="h-16 w-full rounded-2xl bg-pill text-center text-3xl font-bold tracking-[0.2em]
                  tabular-nums outline-none focus:ring-2 focus:ring-accent" />
            : <Field label="Answer" type="password" autoFocus value={text} onChange={(e) => setText(e.target.value)} />}
        </form>
      </Sheet>
    )
  }
  if (duo) {
    const name = clusters?.find((c) => c.id === duo.id)?.name ?? duo.id
    return (
      <Sheet title={name} onClose={() => call('clusters.cancel', { cluster: duo.id }).catch(() => {})}
        actions={<Button className="flex-1" onClick={() => call('clusters.cancel', { cluster: duo.id })
          .catch((e: Error) => toast(e.message))}>Cancel</Button>}>
        <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
          <Smartphone size={72} strokeWidth={1.25} className="text-accent-text" />
          <h2 className="text-2xl font-bold">Approve Duo</h2>
          <p className="text-dim">Open the Duo app and approve the sign-in to {name}, then come back here.</p>
        </div>
      </Sheet>
    )
  }
  return null
}
