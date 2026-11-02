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
import { Button, Field, MainButton, Sheet, useToast } from '../ui'

const digits = (text: string) => text.replace(/\s/g, '')
// web sign-in pages (the VPN's, a portal's) need a sign-in window the phone doesn't have yet
const UNSUPPORTED: Question['kind'][] = ['chrome-window', 'web-login']
const demo = '__TAURI_INTERNALS__' in window ? null : new URLSearchParams(location.search)
const demoLate = demo?.get('duoafter') ?? null  // design work: ?duoafter=0 shows it at once
const LATE = demoLate === null ? 60 : Number(demoLate)

/** Design work in a plain browser: ?question=code|ask|confirm&cluster=sdsc shows that question. */
function demoQuestions(): Question[] {
  const kind = demo?.get('question') as Question['kind'] | null | undefined
  if (!kind) return []
  const cluster = demo?.get('cluster') ?? 'wulver'
  const prompt = kind === 'confirm' ? "The server looks different from last time. Connect anyway?"
    : kind === 'ask' ? 'Password:' : ''
  return [{ id: 'demo', kind, cluster, name: cluster, prompt, title: kind === 'confirm' ? 'Check the server' : undefined }]
}

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
  const [questions, setQuestions] = useState<Question[]>(demoQuestions)
  const [text, setText] = useState('')
  useEffect(load, [])
  // the cluster's own name, from the cluster it is about
  const nameOf = (id: string, fallback = id) => clusters?.find((c) => c.id === id)?.name ?? fallback

  function answer(q: Question, value: string | null) {
    setQuestions((all) => all.filter((x) => x.id !== q.id))
    setText('')
    call('question.answer', { id: q.id, answer: value }).catch((e: Error) => toast(e.message))
  }

  useEvent<Question>('question', (q) => {
    if (UNSUPPORTED.includes(q.kind)) {
      toast(`${nameOf(q.cluster, q.name)} wants a web sign-in, which the phone can't do yet. Use campus Wi-Fi, or connect from a computer.`)
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
    if (s.state === 'Error' && s.detail) toast(`${nameOf(s.id)}: ${s.detail}`)
  })

  const duo = Object.values(sessions).find((s) => s.state === DUO)
  const waited = useSeconds(!!duo)
  const late = waited >= LATE
  const newPush = (id: string) => {
    again.current = id
    call('clusters.cancel', { cluster: id }).catch((e: Error) => toast(e.message))
  }
  const openDuo = () => {  // only the phone app can open Duo Mobile (not the demo in a browser)
    if ('__TAURI_INTERNALS__' in window) invoke('open_duo').catch((e) => toast(String((e as Error).message ?? e)))
  }
  useEffect(() => {
    if (duo) openDuo() // once per push: the push is sent by now, Duo Mobile shows it when it opens
  }, [duo?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const q = questions[0]
  if (q) {
    const stop = () => answer(q, null)
    const name = nameOf(q.cluster, q.name)
    if (q.kind === 'confirm') {
      return (
        <Sheet title={q.title ?? name} onClose={stop} actions={<>
          <Button className="flex-1" onClick={stop}>Stop signing in</Button>
          <Button kind="primary" className="flex-1" onClick={() => answer(q, 'yes')}>Yes</Button></>}>
          <p>{q.prompt?.trim() || 'Go on signing in?'}</p>
        </Sheet>
      )
    }
    const code = q.kind === 'code'
    const send = () => answer(q, code ? digits(text) : text)
    return (
      <Sheet title={code ? `Code for ${name}` : copy.signIn({ name, org: '' })} onClose={stop} actions={<>
        <Button className="flex-1" onClick={stop}>Stop signing in</Button>
        <Button kind="primary" className="flex-1" disabled={code ? !digits(text) : !text} onClick={send}>Send</Button></>}>
        <form onSubmit={(e) => { e.preventDefault(); send() }}>
          {code
            ? <p className="mb-4">Type the 6-digit code from your authenticator app.</p>
            : q.prompt?.trim() && <p className="mb-2 whitespace-pre-wrap text-dim">{q.prompt.trim()}</p>}
          {code
            ? <input autoFocus inputMode="numeric" maxLength={8} placeholder="123456" value={text} aria-label="Code"
                onChange={(e) => {
                  setText(e.target.value)
                  if (/^\d{6}$/.test(digits(e.target.value))) answer(q, digits(e.target.value))
                }}
                className="h-16 w-full rounded-[10px] border border-line-strong bg-window text-center text-3xl
                  font-semibold tracking-[0.2em] tabular-nums outline-none placeholder:text-line-strong
                  focus:border-accent focus:ring-1 focus:ring-accent" />
            : <Field label="Answer" type="password" autoFocus value={text} onChange={(e) => setText(e.target.value)} />}
        </form>
      </Sheet>
    )
  }
  if (duo) {
    const name = nameOf(duo.id)
    const stop = () => call('clusters.cancel', { cluster: duo.id }).catch((e: Error) => toast(e.message))
    return (
      <Sheet title={name} onClose={stop} actions={<div className="flex w-full flex-col gap-3">
        {late
          ? <MainButton onClick={() => newPush(duo.id)}>{copy.newPush}</MainButton>
          : <MainButton onClick={openDuo}>Open Duo</MainButton>}
        <Button onClick={stop}>Stop signing in</Button></div>}>
        <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
          <Smartphone size={64} strokeWidth={1.25} className="text-dim" />
          <h2 className="text-2xl font-semibold">Approve Duo</h2>
          <p className="text-dim">{late ? copy.duoLate : 'Approve the sign-in in Duo Mobile, then come back here.'}</p>
          <p className="text-dim tabular-nums">Waiting {Math.floor(waited / 60)}:{String(waited % 60).padStart(2, '0')}</p>
          {late && <Button kind="quiet" onClick={openDuo}>Open Duo</Button>}
        </div>
      </Sheet>
    )
  }
  return null
}
