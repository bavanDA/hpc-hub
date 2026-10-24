// Questions a login asks while it runs (password, 6-digit code, where to sign in), shown as dialogs.
// The backend waits on a worker thread until question.answer arrives (see hpc_hub/api/hub.py).
// Also what a login shows on any page: the Duo screen, and a toast when a connection fails.
import { useEffect, useState } from 'react'

import { useEvent } from '../hooks'
import { call } from '../rpc'
import { DUO, type Question, type Session } from '../types/clusters'
import { DuoDialog } from './clusters/DuoDialog'
import { QuestionDialog } from './clusters/QuestionDialog'
import { load, useClusters } from './clusters/store'
import { useToast } from './toast'

export function Questions() {
  const toast = useToast()
  const { clusters, sessions } = useClusters()
  const [questions, setQuestions] = useState<Question[]>([])
  useEffect(load, [])

  useEvent<Question>('question', (q) => setQuestions((all) => [...all.filter((x) => x.id !== q.id), q]))
  useEvent<{ id: string }>('question-done', ({ id }) => setQuestions((all) => all.filter((x) => x.id !== id)))
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
