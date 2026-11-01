// What a login asks while it runs (hpc_hub/api/hub.py): a password, a 6-digit code, a yes or no; and the Duo
// screen while it waits for your phone, which opens Duo Mobile for you. A push expires after about a minute, so
// after LATE seconds it says so and offers a new one (a fresh login, like the desktop's DuoDialog). The backend
// waits on a worker thread until question.answer arrives.
import { invoke } from '@tauri-apps/api/core'
import { Smartphone } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { copy } from '@shared/components/clusters/loginCopy'
import { load, useClusters } from '@shared/components/clusters/store'
import { useEvent } from '@shared/hooks'
import { call } from '@shared/rpc'
import { DUO, type Question, type Session } from '@shared/types/clusters'
import { Button, Field, Sheet, useToast } from '../ui'

const digits = (text: string) => text.replace(/\s/g, '')
// web sign-in pages (the VPN's, a portal's) need a sign-in window the phone doesn't have yet
const UNSUPPORTED: Question['kind'][] = ['chrome-window', 'web-login']
const demoLate = new URLSearchParams(location.search).get('duoafter')  // design work: ?duoafter=0 shows it at once
const LATE = demoLate === null ? 60 : Number(demoLate)

/** How long Duo has waited, counting up each second. */
function useSeconds(running: boolean) {
  const [start, setStart] = useState(0)
  const [now, setNow] = useState(0)
  useEffect(() => {
    if (!running) return
    const t0 = Date.now()
    setStart(t0)
    setNow(t0)
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [running])
  return Math.floor((now - start) / 1000)
}

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
      toast(`${q.name} wants a web sign-in, which the phone can't do yet. Use campus Wi-Fi, or connect from a computer.`)
      call('question.answer', { id: q.id, answer: null }).catch(() => {})
      return
    }
    setQuestions((all) => [...all.filter((x) => x.id !== q.id), q])
  })
  useEvent<{ id: string }>('question-done', ({ id }) => setQuestions((all) => all.filter((x) => x.id !== id)))
  const again = useRef('')  // Send a new push: cancelled, connect again once it has stopped
  useEvent<Session>('session', (s) => {
    if (again.current === s.id && (s.state === 'Disconnected' || s.state === 'Error')) {
      again.current = ''
      call('clusters.connect', { cluster: s.id, switch: true }).catch((e: Error) => toast(e.message))
      return
    }
    if (s.state === 'Error' && s.detail) toast(`${clusters?.find((c) => c.id === s.id)?.name ?? s.id}: ${s.detail}`)
  })

  const duo = Object.values(sessions).find((s) => s.state === DUO)
  const waited = useSeconds(!!duo)
  const late = waited >= LATE
  const newPush = (id: string) => {
    again.current = id
    call('clusters.cancel', { cluster: id }).catch((e: Error) => toast(e.message))
  }
  const openDuo = () => invoke('open_duo').catch((e) => toast(String((e as Error).message ?? e)))
  useEffect(() => {
    if (duo) openDuo() // once per push: the push is sent by now, Duo Mobile shows it when it opens
  }, [duo?.id]) // eslint-disable-line react-hooks/exhaustive-deps
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
        actions={<>
          <Button className="flex-1" onClick={() => call('clusters.cancel', { cluster: duo.id })
            .catch((e: Error) => toast(e.message))}>Cancel</Button>
          {late
            ? <Button kind="primary" className="flex-1" onClick={() => newPush(duo.id)}>{copy.newPush}</Button>
            : <Button kind="primary" className="flex-1" onClick={openDuo}>Open Duo</Button>}</>}>
        <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
          <Smartphone size={72} strokeWidth={1.25} className={late ? 'text-warn' : 'text-accent-text'} />
          <h2 className="text-2xl font-bold">Approve Duo</h2>
          <p className="text-dim">{late ? copy.duoLate
            : `Approve the sign-in to ${name} in Duo Mobile, then come back here.`}</p>
          <p className="text-dim tabular-nums">Waiting {Math.floor(waited / 60)}:{String(waited % 60).padStart(2, '0')}</p>
          {late && <button onClick={openDuo} className="h-11 font-semibold text-accent-text">Open Duo</button>}
        </div>
      </Sheet>
    )
  }
  return null
}
