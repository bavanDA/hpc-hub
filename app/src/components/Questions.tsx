// Questions a login asks while it runs (password, 6-digit code, where to sign in), shown as dialogs.
// The backend waits on a worker thread until question.answer arrives (see hpc_hub/api/hub.py).
// Also what a login shows on any page: the Duo screen, and a toast when a connection fails.
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useEffect, useRef, useState } from 'react'

import { useEvent } from '../hooks'
import { call } from '../rpc'
import { DUO, type Question, type Session } from '../types/clusters'
import { DuoDialog } from './clusters/DuoDialog'
import { QuestionDialog } from './clusters/QuestionDialog'
import { inTauri } from './clusters/SignIn'
import { load, useClusters } from './clusters/store'
import { useToast } from './toast'

export function Questions() {
  const toast = useToast()
  const { clusters, sessions } = useClusters()
  const [questions, setQuestions] = useState<Question[]>([])
  const asked = useRef<Question[]>([])
  asked.current = questions
  useEffect(load, [])

  useEvent<Question>('question', (q) => setQuestions((all) => [...all.filter((x) => x.id !== q.id), q]))
  useEvent<{ id: string }>('question-done', ({ id }) => {
    // a sign-in the backend stopped waiting for (cancelled, timed out): its window goes too
    if (inTauri && asked.current.some((x) => x.id === id && x.kind === 'web-login')) {
      invoke('sso_close', { id }).catch(() => {})
    }
    setQuestions((all) => all.filter((x) => x.id !== id))
  })
  // the sign-in window reports back (sso.rs): the token goes straight to the backend, never shown or kept
  useEffect(() => {
    if (!inTauri) return
    const stop = listen<{ id: string; token: string; error: string }>('sso-result', ({ payload: r }) => {
      const q = asked.current.find((x) => x.id === r.id && x.kind === 'web-login')
      if (q) answer(q, JSON.stringify({ token: r.token, error: r.error }))
    })
    return () => { stop.then((fn) => fn()) }
  }, [])
  useEvent<Session>('session', (s) => {
    if (s.state === 'Error' && s.detail) toast(`${clusters?.find((c) => c.id === s.id)?.name ?? s.id}: ${s.detail}`)
  })

  function answer(q: Question, value: string | null) {
    setQuestions((all) => all.filter((x) => x.id !== q.id))
    call('question.answer', { id: q.id, answer: value }).catch((e: Error) => toast(e.message))
  }

  const duo = Object.values(sessions).find((s) => s.state === DUO)
  const q = questions[0]
  return (
    <>
      {duo && <DuoDialog key={duo.id} name={clusters?.find((c) => c.id === duo.id)?.name ?? duo.id}
        onCancel={() => call('clusters.cancel', { cluster: duo.id }).catch((e: Error) => toast(e.message))} />}
      {q && <QuestionDialog key={q.id} q={q} cluster={clusters?.find((c) => c.id === q.cluster)}
        onAnswer={(a) => answer(q, a)} />}
    </>
  )
}
