// More › Transfers: copies between clusters. "Copies" are the ones HPC Hub runs (through this phone, on a cluster,
// or handed to Globus from Files); "Globus" is your Globus account: its recent transfers, and a new copy that runs
// cluster to cluster, so it keeps going with the app or the phone off.
import { ArrowLeftRight, CircleAlert, KeyRound, Plus, RefreshCw, Settings } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useTransfers } from '@shared/components/files/useTransfers'
import { Spinner } from '@shared/components/ui/Spinner'
import { useGo, usePageParams } from '@shared/nav'
import { call } from '@shared/rpc'
import type { Transfer } from '@shared/types/files'
import type { CheckResult, GlobusCluster, GlobusStatus, Task } from '@shared/types/globus'
import { shortCluster } from '../parts/code/util'
import { TransferRow } from '../parts/files/TransferRow'
import { CollectionSheet } from '../parts/globus/CollectionSheet'
import { CopySheet } from '../parts/globus/CopySheet'
import { AccountSheet, SetUp, SignIn } from '../parts/globus/Setup'
import { SignInSheet } from '../parts/globus/SignInSheet'
import { TaskRow } from '../parts/globus/TaskRow'
import { Header } from '../parts/Header'
import { Button, ConfirmSheet, EmptyState, List, MainButton, Row, Section, Segments, useToast } from '../ui'

type View = 'copies' | 'globus'
const POLL_MS = 10_000

function Copies() {
  const go = useGo()
  const toast = useToast()
  const [stop, setStop] = useState<Transfer | null>(null)
  const { items, x } = useTransfers((t) => {
    if (!t.error && !t.title.includes('this computer')) toast(`Copied ${t.title.split(':')[0]}`)
  })
  if (!items.length) {
    return <EmptyState icon={ArrowLeftRight} title="No copies yet"
      text="In Files, tap Copy on a file, then Paste here in another folder or cluster."
      action={<Button onClick={() => go('files')}>Open Files</Button>} />
  }
  return (
    <>
      <List>{items.map((t) => <TransferRow key={t.id} t={t} onX={(t) => t.finished || t.error ? x(t) : setStop(t)} />)}</List>
      {stop && <ConfirmSheet danger keep="Keep copying" confirm="Stop copy" title={`Stop copying ${stop.title.split(':')[0]}?`}
        text="What's copied so far stays where it is." onClose={() => setStop(null)} onConfirm={() => x(stop)} />}
    </>
  )
}

function Globus() {
  const toast = useToast()
  const [status, setStatus] = useState<GlobusStatus | null>(null)
  const [error, setError] = useState('')
  const [login, setLogin] = useState<'globus.login_url' | 'globus.consent_url' | null>(null)
  const [account, setAccount] = useState(false)
  const [choosing, setChoosing] = useState<GlobusCluster | null>(null)
  const [copying, setCopying] = useState(false)
  const [stamp, setStamp] = useState(0)
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [tasksError, setTasksError] = useState('')
  const [cancel, setCancel] = useState<Task | null>(null)
  const checked = useRef(false)
  const signedIn = !!status?.signed_in

  useEffect(() => {
    call<GlobusStatus>('globus.status').then(setStatus).catch((e: Error) => setError(e.message))
  }, [])

  const loadTasks = useCallback(() => {
    call<Task[]>('globus.tasks').then((all) => { setTasks(all); setTasksError('') })
      .catch((e: Error) => setTasksError(e.message))
  }, [])

  // signed in: find missing collections once, then keep the transfers fresh while you look
  useEffect(() => {
    if (!signedIn) return
    if (!checked.current) {
      checked.current = true
      call<CheckResult>('globus.check').then((r) => {
        setStatus(r)
        r.changes.forEach((c) => toast(c.collection ? `${shortCluster(c.name)} uses Globus collection ${c.collection}`
          : `No Globus collection found for ${shortCluster(c.name)}. Pick one in Globus account.`))
      }).catch((e: Error) => toast(`Globus: ${e.message}`))
    }
    loadTasks()
    const t = setInterval(loadTasks, POLL_MS)
    return () => clearInterval(t)
  }, [signedIn, loadTasks, toast])

  const signedInNow = (s: GlobusStatus) => {
    const consent = login === 'globus.consent_url'
    setLogin(null)
    setStatus(s)
    toast(consent ? 'Globus is ready' : 'Signed in to Globus')
    if (consent) setStamp((n) => n + 1)
  }
  const doCancel = (t: Task) => call('globus.cancel', { task_id: t.task_id })
    .then(() => toast('Copy stopped')).catch((e: Error) => toast(`Couldn't stop it: ${e.message}`))
    .finally(loadTasks)
  const names = Object.fromEntries((status?.clusters ?? []).filter((c) => c.collection_name)
    .map((c) => [c.collection_name, shortCluster(c.name)]))

  let body
  if (error) body = <EmptyState icon={CircleAlert} title="Couldn't load Globus" text={error} />
  else if (!status) body = <div className="grid h-40 place-items-center"><Spinner size={28} /></div>
  else if (!status.client_id) body = <SetUp onSaved={setStatus} />
  else if (!status.signed_in) body = <SignIn onSignIn={() => setLogin('globus.login_url')} />
  else body = (
    <>
      {status.wants.length > 0 && (
        <List>
          <Row icon={KeyRound} opens onPress={() => setLogin('globus.consent_url')}
            label={`Allow Globus for ${status.wants.map((w) => shortCluster(w.name)).join(' and ')}`} />
        </List>
      )}
      <div className="px-4 pt-4"><MainButton icon={Plus} onClick={() => setCopying(true)}>New Globus copy</MainButton></div>
      <section className="pt-5">
        <div className="flex items-center pr-2 pl-4">
          <h3 className="flex-1 text-xs font-semibold tracking-wide text-dim uppercase">Recent</h3>
          <button aria-label="Refresh" onClick={loadTasks}
            className="grid size-12 place-items-center rounded-full text-dim active:bg-pressed"><RefreshCw size={20} /></button>
        </div>
        <List>
          {tasksError && <p className="px-4 py-3 text-bad">{tasksError}</p>}
          {!tasks && !tasksError && <div className="grid h-24 place-items-center"><Spinner size={24} /></div>}
          {tasks && !tasks.length && <p className="px-4 py-3 text-dim">No Globus copies yet.</p>}
          {tasks?.map((t) => <TaskRow key={t.task_id} t={t} names={names} onCancel={setCancel} />)}
        </List>
      </section>
    </>
  )

  return (
    <>
      {body}
      {status?.client_id && (
        <Section><Row icon={Settings} label="Globus account" opens onPress={() => setAccount(true)} /></Section>
      )}
      {account && status && <AccountSheet status={status} onClose={() => setAccount(false)} onChange={setStatus}
        onSignIn={() => { setAccount(false); setLogin('globus.login_url') }}
        onChoose={(c) => { setAccount(false); setChoosing(c) }} />}
      {copying && status && <CopySheet status={status} stamp={stamp} onClose={() => setCopying(false)}
        onConsent={() => setLogin('globus.consent_url')} onChooseCollection={setChoosing}
        onSent={() => { setCopying(false); loadTasks() }} />}
      {choosing && <CollectionSheet cluster={choosing} onClose={() => setChoosing(null)}
        onPicked={(s) => { setStatus(s); setChoosing(null); setStamp((n) => n + 1) }} />}
      {login && <SignInSheet start={login} onClose={() => setLogin(null)} onDone={signedInNow} />}
      {cancel && <ConfirmSheet danger keep="Keep copying" confirm="Stop copy" title={`Stop ${cancel.label.replace(/^HPC Hub /, '')}?`}
        text="What's copied so far stays where it is." onClose={() => setCancel(null)}
        onConfirm={() => doCancel(cancel)} />}
    </>
  )
}

export function Transfers() {
  const params = usePageParams()
  const [view, setView] = useState<View>(params.view === 'globus' || params.globus ? 'globus' : 'copies')
  return (
    <div className="flex h-full flex-col">
      <Header title="Transfers" />
      <div className="px-4 pb-3">
        <Segments value={view} options={[['copies', 'Copies'], ['globus', 'Globus']]} onChange={setView} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {view === 'copies' ? <Copies /> : <Globus />}
      </div>
    </div>
  )
}
