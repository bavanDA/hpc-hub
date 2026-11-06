import { CircleAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Board } from '../components/globus/Board'
import { CollectionPicker } from '../components/globus/CollectionPicker'
import { LoginDialog } from '../components/globus/LoginDialog'
import { SettingsDialog } from '../components/globus/SettingsDialog'
import { SetUp } from '../components/globus/SetUp'
import { SignIn } from '../components/globus/SignIn'
import { usePane, type Pane } from '../components/globus/usePane'
import { useTasks } from '../components/globus/useTasks'
import { useToast } from '../components/useToast'
import { EmptyState, Spinner } from '../components/ui'
import { call } from '../rpc'
import type { CheckResult, GlobusCluster, GlobusStatus } from '../types/globus'

const POLL_MS = 10_000

export function Globus() {
  const toast = useToast()
  const [status, setStatus] = useState<GlobusStatus | null>(null)
  const [error, setError] = useState('')
  const [login, setLogin] = useState<'globus.login_url' | 'globus.consent_url' | null>(null)
  const [picking, setPicking] = useState<GlobusCluster | null>(null)
  const [settings, setSettings] = useState(false)

  const refresh = useCallback(() => call<GlobusStatus>('globus.status').then(setStatus).catch(() => {}), [])
  const left = usePane(refresh)
  const right = usePane(refresh)
  const panes = useRef<Pane[]>([])
  panes.current = [left, right]
  const { tasks, error: tasksError, load: loadTasks } = useTasks(panes)
  const signedIn = !!status?.signed_in

  useEffect(() => {
    call<GlobusStatus>('globus.status').then(setStatus).catch((e: Error) => setError(e.message))
  }, [])

  // Find missing collections and ask each what it wants, so one sign-in can cover all of them
  const check = useCallback(() => {
    call<CheckResult>('globus.check').then((r) => {
      setStatus(r)
      r.changes.forEach((c) => toast(c.collection ? `${c.name} uses Globus collection ${c.collection}`
        : `No Globus collection found for ${c.name}. Pick one`))
      if (r.changes.length) panes.current.forEach((p) => p.reload())
    }).catch((e: Error) => toast(`Globus: ${e.message}`))
  }, [toast])

  // Signed in: open the two panes (clusters with a collection first), check, and watch transfers
  const firstClusters = useRef(false)
  useEffect(() => {
    if (!signedIn || !status) return
    if (!firstClusters.current) {
      firstClusters.current = true
      const order = [...status.clusters.filter((c) => c.collection_id), ...status.clusters]
      const first = order[0]?.id ?? ''
      panes.current[0].pick(first)
      panes.current[1].pick(order.find((c) => c.id !== first)?.id ?? first)
    } else panes.current.forEach((p) => p.reload())
    check()
    loadTasks()
    const t = setInterval(loadTasks, POLL_MS)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn])

  const signedInNow = (s: GlobusStatus) => {
    const consent = login === 'globus.consent_url'
    setLogin(null)
    setStatus(s)
    toast(consent ? 'Globus is ready' : 'Signed in to Globus')
    if (consent) {  // a fresh sign-in starts everything through signedIn
      check()  // anything left (a second domain) shows again
      panes.current.forEach((p) => p.reload())
    }
  }

  let body
  if (error) body = <EmptyState icon={CircleAlert} title="Could not load Globus" text={error} />
  else if (!status) body = <div className="grid h-full place-items-center"><Spinner size={24} /></div>
  else if (!status.client_id) body = <SetUp onSaved={setStatus} />
  else if (!status.signed_in) body = <SignIn onSignIn={() => setLogin('globus.login_url')} />
  else body = <Board status={status} left={left} right={right} tasks={tasks} tasksError={tasksError}
    loadTasks={loadTasks} check={check} onSettings={() => setSettings(true)} onChoose={setPicking}
    onConsent={() => setLogin('globus.consent_url')} />

  return (
    <>
      {body}
      {settings && status && <SettingsDialog status={status} onClose={() => setSettings(false)} onChange={setStatus}
        onSignIn={() => { setSettings(false); setLogin('globus.login_url') }}
        onChoose={(c) => { setSettings(false); setPicking(c) }} />}
      {login && <LoginDialog start={login} onClose={() => setLogin(null)} onDone={signedInNow} />}
      {picking && <CollectionPicker cluster={picking} onClose={() => setPicking(null)}
        onPicked={(s) => {
          setStatus(s)
          setPicking(null)
          panes.current.filter((p) => p.cluster === picking.id).forEach((p) => p.reload())
          check()  // the new one may want its own Allow
        }} />}
    </>
  )
}
