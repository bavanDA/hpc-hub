import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useEffect, useRef, useState } from 'react'

import { useEvent } from '../hooks'
import { call } from '../rpc'
import { DUO, type Question, type Session } from '../types/clusters'
import { inTauri } from './app/platform'
import { DuoDialog } from './clusters/DuoDialog'
import { KeySetupDialog } from './clusters/KeySetupDialog'
import { QuestionDialog } from './clusters/QuestionDialog'
import { SettingsDialog } from './clusters/SettingsDialog'
import { load, useClusters } from './clusters/store'
import { WrongPasswordDialog } from './clusters/WrongPasswordDialog'
import { useToast } from './useToast'

// a plain browser (design work): ?question=chrome-window|web-login or ?show=settings|keysetup,
// with &cluster=id and &tab=login|compute|server|vscode|agents (else the list), opens that dialog with
// demo data
const demo = inTauri ? null : new URLSearchParams(location.search)

const DEMO_NAMES: Record<string, string> = { wulver: 'Wulver (NJIT)', yale: 'Yale Bouchet', sdsc: 'SDSC Expanse' }

function demoQuestions(): Question[] {
  const kind = demo?.get('question') as Question['kind'] | undefined
  const cluster = demo?.get('cluster') ?? 'wulver'
  const confirm = kind === 'confirm' ? { title: 'Let HPC Hub start the VPN',
    prompt: 'Your computer asks for your permission once. After that, Connect starts the VPN by itself.' } : {}
  return kind ? [{ id: 'demo', kind, cluster, name: DEMO_NAMES[cluster] ?? cluster, default: '',
    fill: { socket: '', token: '' }, ...confirm }] : []
}

export function Questions() {
  const toast = useToast()
  const { clusters, sessions } = useClusters()
  const [questions, setQuestions] = useState<Question[]>(demoQuestions)
  const [shown, setShown] = useState(demo?.get('show') ?? '')
  const [wrong, setWrong] = useState<{ id: string; detail: string } | null>(
    demo?.get('show') === 'wrong-password' ? { id: demo.get('cluster') ?? 'wulver',
      detail: "Wulver (NJIT) didn't accept the password for ab123. Type it again, or check your UCID." } : null)
  const asked = useRef<Question[]>([])
  useEffect(() => { asked.current = questions })
  useEffect(load, [])

  function answer(q: Question, value: string | null) {
    setQuestions((all) => all.filter((x) => x.id !== q.id))
    call('question.answer', { id: q.id, answer: value }).catch((e: Error) => toast(e.message))
  }
  const answerRef = useRef(answer)
  useEffect(() => { answerRef.current = answer })

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
      if (q) answerRef.current(q, JSON.stringify({ token: r.token, error: r.error }))
    })
    return () => { stop.then((fn) => fn()) }
  }, [])
  // "Send a new push": cancel the waiting login, then connect again once it has stopped
  const again = useRef('')
  useEvent<Session>('session', (s) => {
    if (s.state === 'Error' && s.wrong_password && again.current !== s.id) {
      setWrong({ id: s.id, detail: s.detail ?? 'The password was not accepted.' })  // a window, not a passing note
    } else if (s.state === 'Error' && s.detail && again.current !== s.id) {
      toast(`${clusters?.find((c) => c.id === s.id)?.name ?? s.id}: ${s.detail}`, { kind: 'error' })
    }
    if (again.current === s.id && (s.state === 'Disconnected' || s.state === 'Error')) {
      again.current = ''
      call('clusters.connect', { cluster: s.id }).catch((e: Error) => toast(e.message))
    }
  })
  const retry = (id: string) => {
    again.current = id
    call('clusters.cancel', { cluster: id }).catch((e: Error) => toast(e.message))
  }

  const demoCluster = clusters?.find((c) => c.id === (demo?.get('cluster') ?? 'wulver'))

  const duo = Object.values(sessions).find((s) => s.state === DUO)
  const q = questions[0]
  return (
    <>
      {duo && <DuoDialog key={duo.id} name={clusters?.find((c) => c.id === duo.id)?.name ?? duo.id}
        onCancel={() => call('clusters.cancel', { cluster: duo.id }).catch((e: Error) => toast(e.message))}
        onRetry={() => retry(duo.id)} />}
      {q && <QuestionDialog key={q.id} q={q} cluster={clusters?.find((c) => c.id === q.cluster)}
        onAnswer={(a) => answer(q, a)} />}
      {wrong && clusters?.find((c) => c.id === wrong.id) && <WrongPasswordDialog key={wrong.id}
        cluster={clusters.find((c) => c.id === wrong.id)!} detail={wrong.detail} onClose={() => setWrong(null)} />}
      {shown === 'settings' && demoCluster && <SettingsDialog cluster={demoCluster} onClose={() => setShown('')}
        start={demo?.get('tab') ?? ''} advanced={demo?.has('advanced')} hint={demo?.get('hint') ?? undefined} />}
      {shown === 'keysetup' && demoCluster && <KeySetupDialog cluster={demoCluster} onClose={() => setShown('')}
        onDone={() => setShown('')} />}
    </>
  )
}
