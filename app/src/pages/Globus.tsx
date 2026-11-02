// Globus: two clusters side by side, browsed through Globus, with transfers between them that run on Globus.
import { ArrowLeft, ArrowRight, CircleAlert, Settings } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { shortName } from '../components/clusters/loginCopy'
import { Banner } from '../components/globus/Banner'
import { CollectionPicker } from '../components/globus/CollectionPicker'
import { LoginDialog } from '../components/globus/LoginDialog'
import { Pane } from '../components/globus/Pane'
import { joinPath } from '../components/globus/parts'
import { SetUp, SettingsDialog, SignIn } from '../components/globus/Setup'
import { Transfers } from '../components/globus/Transfers'
import { usePane, type Pane as PaneState } from '../components/globus/usePane'
import { useToast } from '../components/toast'
import { Button, EmptyState, IconButton, Spinner } from '../components/ui'
import { call } from '../rpc'
import type { CheckResult, GlobusCluster, GlobusStatus, Task } from '../types/globus'

const POLL_MS = 10_000

export function Globus() {
  const toast = useToast()
  const [status, setStatus] = useState<GlobusStatus | null>(null)
  const [error, setError] = useState('')
  const [login, setLogin] = useState<'globus.login_url' | 'globus.consent_url' | null>(null)
  const [picking, setPicking] = useState<GlobusCluster | null>(null)
  const [settings, setSettings] = useState(false)
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [tasksError, setTasksError] = useState('')
  const seenActive = useRef(new Set<string>())

  const refresh = useCallback(() => call<GlobusStatus>('globus.status').then(setStatus).catch(() => {}), [])
  const left = usePane(refresh)
  const right = usePane(refresh)
  const panes = useRef<PaneState[]>([])
  panes.current = [left, right]
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

  const loadTasks = useCallback(() => {
    call<Task[]>('globus.tasks').then((all) => {
      setTasks(all)
      setTasksError('')
      if (all.some((t) => t.status === 'SUCCEEDED' && seenActive.current.has(t.task_id))) {
        panes.current.forEach((p) => p.reload())  // a copy landed: show it
      }
      seenActive.current = new Set(all.filter((t) => t.active).map((t) => t.task_id))
    }).catch((e: Error) => setTasksError(e.message))
  }, [])

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

  const transfer = (src: PaneState, dst: PaneState) => {
    const it = src.selected
    if (!it) return
    if (!dst.path) { toast('Open a folder on the other side first'); return }
    call('globus.transfer', { src_cluster: src.cluster, src_path: joinPath(src.path, it.name),
      dst_cluster: dst.cluster, dst_path: joinPath(dst.path, it.name), recursive: it.is_dir })
      .then(() => { toast(`Sent ${it.name} to Globus`); loadTasks() })
      .catch((e: Error) => { toast(`Transfer failed: ${e.message}`); check() })
  }

  const cancel = (id: string) => call('globus.cancel', { task_id: id })
    .then(() => toast('Transfer cancelled')).catch((e: Error) => toast(`Cancel failed: ${e.message}`))
    .finally(loadTasks)

  const startPersonal = async (c: GlobusCluster) => {
    toast(`Starting Globus Connect on ${c.name}…`)
    try {
      await call('globus.start_personal', { cluster: c.id })
      toast(`Globus Connect is running on ${c.name}`)
    } catch (e) {
      toast(`Could not start Globus Connect: ${(e as Error).message}`)
    }
  }

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
  else body = (
    <div className="flex h-full min-h-[560px] flex-col gap-3 px-4 py-4 [color-scheme:light_dark]">
      <Banner wants={status.wants} onClick={() => setLogin('globus.consent_url')} />
      <div className="flex items-center gap-2 pl-1">
        <p className="flex-1 text-sm text-dim">Copies run on Globus, so you can close the app or your laptop.</p>
        <IconButton icon={Settings} label="Globus settings" size={16} onClick={() => setSettings(true)} />
      </div>
      <div className="flex min-h-[340px] flex-1 gap-3">
        <Pane pane={left} clusters={status.clusters} onChoose={setPicking} onStart={startPersonal}
          onConsent={() => setLogin('globus.consent_url')} />
        <div className="flex shrink-0 flex-col items-center justify-center gap-2">
          <Button kind={left.selected ? 'suggested' : 'pill'} disabled={!left.selected} title="Send the selected item"
            onClick={() => transfer(left, right)}>Transfer<ArrowRight size={16} /></Button>
          <Button kind={right.selected ? 'suggested' : 'pill'} disabled={!right.selected} title="Send the selected item"
            onClick={() => transfer(right, left)}><ArrowLeft size={16} />Transfer</Button>
        </div>
        <Pane pane={right} clusters={status.clusters} onChoose={setPicking} onStart={startPersonal}
          onConsent={() => setLogin('globus.consent_url')} />
      </div>
      <Transfers tasks={tasks} error={tasksError} onRefresh={loadTasks} onCancel={cancel}
        names={Object.fromEntries(status.clusters.filter((c) => c.collection_name)
          .map((c) => [c.collection_name, shortName(c)]))} />
    </div>
  )

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
